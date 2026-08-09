// src/modules/anchor/anchor.service.ts
import { Injectable, Logger, NotFoundException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { Repository } from 'typeorm';

import { DocumentEntity } from '../../database/entities/document.entity';
import { AnchorBatchEntity } from '../../database/entities/anchor-batch.entity';
import { StorageService } from '../../common/modules/storage/storage.service';
import type { PublicVerifyResult } from './types/public-verify-result.type';
import {
  TIMESTAMP_CLIENT,
  type TimestampClientPort,
} from './ports/timestamp-client.port';
import { buildMerkleTree, verifyMerkleProof } from './merkle.util';

/** Upper bound on how many documents go into one Merkle batch per run. */
const MAX_LEAVES_PER_BATCH = 256;

export type DocumentVerifyResult = {
  status: 'VALID' | 'MODIFIED' | 'NOT_ANCHORED';
  documentId: string;
  storedSha256: string;
  currentSha256: string;
  /** Merkle root the document was anchored under, or null when not anchored. */
  rootHex: string | null;
  batchId: string | null;
  timestampedAt: Date | null;
  reason: string | null;
};

@Injectable()
export class AnchorService {
  private readonly logger = new Logger(AnchorService.name);

  constructor(
    @InjectRepository(DocumentEntity)
    private readonly docsRepo: Repository<DocumentEntity>,
    @InjectRepository(AnchorBatchEntity)
    private readonly batchRepo: Repository<AnchorBatchEntity>,
    private readonly storage: StorageService,
    @Inject(TIMESTAMP_CLIENT)
    private readonly timestampClient: TimestampClientPort,
  ) {}

  async getDocOrThrow(
    tenantId: string,
    documentId: string,
  ): Promise<DocumentEntity> {
    const doc = await this.docsRepo.findOne({
      where: { id: documentId, tenantId },
    });

    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  /**
   * The value committed as a document's Merkle leaf. This is the hash of the
   * bytes actually stored (ciphertext when encrypted), so verification can
   * recompute it from storage.
   */
  private leafValue(doc: DocumentEntity): string {
    return doc.sha256CipherHex ?? doc.sha256PlainHex;
  }

  /**
   * Build a Merkle tree over the given documents, obtain one external timestamp
   * for the root, and persist the batch plus each document's inclusion proof
   * atomically. The (network) timestamp call happens BEFORE the DB transaction
   * so a transaction never waits on the TSA.
   */
  private async anchorDocuments(
    docs: DocumentEntity[],
  ): Promise<AnchorBatchEntity | null> {
    if (docs.length === 0) return null;

    const tree = buildMerkleTree(docs.map((d) => this.leafValue(d)));
    const ts = await this.timestampClient.timestampRoot(tree.root);

    return this.docsRepo.manager.transaction(async (em) => {
      const batchRepo = em.getRepository(AnchorBatchEntity);
      const docRepo = em.getRepository(DocumentEntity);

      const batch = await batchRepo.save(
        batchRepo.create({
          rootHex: tree.root,
          leafCount: tree.leafCount,
          status: ts.simulated ? 'SIMULATED' : 'TIMESTAMPED',
          timestampTokenB64: ts.tokenB64,
          tsaUrl: ts.tsaUrl,
          tsaSerial: ts.serial,
          timestampedAt: ts.simulated ? null : ts.timestampedAt,
        }),
      );

      docs.forEach((doc, index) => {
        doc.anchorBatchId = batch.id;
        doc.anchorLeafIndex = index;
        doc.anchorProof = tree.proofFor(index);
        // A simulated timestamp is not proof: mark the document SIMULATED and
        // record no anchored time, so verification refuses to call it VALID.
        doc.anchorStatus = ts.simulated ? 'SIMULATED' : 'ANCHORED';
        doc.anchoredAt = ts.simulated ? null : ts.timestampedAt;
        doc.anchorRetries = 0;
      });
      await docRepo.save(docs);

      return batch;
    });
  }

  /**
   * Anchor a single document on demand (a degenerate one-leaf batch). Used by
   * the notary flow.
   */
  async anchorDocumentById(opts: {
    tenantId: string;
    documentId: string;
  }): Promise<{ doc: DocumentEntity; batch: AnchorBatchEntity }> {
    const doc = await this.getDocOrThrow(opts.tenantId, opts.documentId);
    const batch = await this.anchorDocuments([doc]);
    if (!batch) {
      throw new Error('Anchoring produced no batch');
    }
    return { doc, batch };
  }

  async processPending(): Promise<{ processed: number; failed: number }> {
    const pending = await this.docsRepo.find({
      where: { anchorStatus: 'PENDING' },
      order: { createdAt: 'ASC' },
      take: MAX_LEAVES_PER_BATCH,
    });

    if (pending.length === 0) {
      return { processed: 0, failed: 0 };
    }

    try {
      const batch = await this.anchorDocuments(pending);
      this.logger.log(
        `Anchored batch ${batch?.id} — ${pending.length} docs, status=${batch?.status}`,
      );
      return { processed: pending.length, failed: 0 };
    } catch (err: unknown) {
      // Leave the documents PENDING. A transient timestamping failure should be
      // retried on the next run, not turned into a permanent FAILED state.
      this.logger.error(
        `Failed to anchor batch of ${pending.length} docs: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return { processed: 0, failed: pending.length };
    }
  }

  async verifyDocument(documentId: string): Promise<DocumentVerifyResult> {
    const doc = await this.docsRepo.findOne({ where: { id: documentId } });
    if (!doc) {
      throw new NotFoundException('Document not found');
    }

    const currentSha256 = this.sha256Hex(
      await this.storage.getBuffer(doc.storageKey),
    );
    const storedSha256 = this.leafValue(doc);

    const batch = doc.anchorBatchId
      ? await this.batchRepo.findOne({ where: { id: doc.anchorBatchId } })
      : null;

    const isAnchored =
      batch?.status === 'TIMESTAMPED' &&
      !!doc.anchorProof &&
      !!doc.anchoredAt &&
      !!batch.timestampedAt;

    if (!isAnchored) {
      return {
        status: 'NOT_ANCHORED',
        documentId: doc.id,
        storedSha256,
        currentSha256,
        rootHex: batch?.rootHex ?? null,
        batchId: doc.anchorBatchId ?? null,
        timestampedAt: null,
        reason:
          doc.anchorStatus === 'FAILED'
            ? `Anchor failed after ${doc.anchorRetries ?? 0} retries`
            : doc.anchorStatus === 'SIMULATED'
              ? 'Anchoring is simulated in this environment; no external timestamp exists'
              : 'Document pending anchoring',
      };
    }

    if (currentSha256 !== storedSha256) {
      return {
        status: 'MODIFIED',
        documentId: doc.id,
        storedSha256,
        currentSha256,
        rootHex: batch.rootHex,
        batchId: batch.id,
        timestampedAt: batch.timestampedAt,
        reason: 'Content hash mismatch — document may have been tampered',
      };
    }

    const includedInRoot = verifyMerkleProof(
      storedSha256,
      doc.anchorProof ?? [],
      batch.rootHex,
    );
    if (!includedInRoot) {
      return {
        status: 'MODIFIED',
        documentId: doc.id,
        storedSha256,
        currentSha256,
        rootHex: batch.rootHex,
        batchId: batch.id,
        timestampedAt: batch.timestampedAt,
        reason: 'Inclusion proof does not reconstruct the anchored root',
      };
    }

    // NOTE (next phase): the RFC 3161 token's signature over the root is not yet
    // cryptographically validated here. That step confirms the TSA attested this
    // exact root at `timestampedAt`; until then VALID means "content unchanged
    // and included in the anchored root", which is stored alongside the token.
    return {
      status: 'VALID',
      documentId: doc.id,
      storedSha256,
      currentSha256,
      rootHex: batch.rootHex,
      batchId: batch.id,
      timestampedAt: batch.timestampedAt,
      reason: null,
    };
  }

  async verifyDocumentPublic(documentId: string): Promise<PublicVerifyResult> {
    const result = await this.verifyDocument(documentId);

    // No external timestamp → nothing to serve publicly. A MODIFIED result is
    // still returned: the public verifier must be able to see tampering.
    if (
      result.status === 'NOT_ANCHORED' ||
      !result.rootHex ||
      !result.timestampedAt
    ) {
      throw new NotFoundException('Public verification record not found');
    }

    return {
      status: result.status,
      documentId: result.documentId,
      rootHex: result.rootHex,
      batchId: result.batchId,
      timestampedAt: result.timestampedAt,
    };
  }

  private sha256Hex(buf: Buffer): string {
    return createHash('sha256').update(buf).digest('hex');
  }
}
