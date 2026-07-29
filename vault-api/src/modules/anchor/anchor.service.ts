// src/modules/anchor/anchor.service.ts
import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { Repository } from 'typeorm';

import { DocumentEntity } from '../../database/entities/document.entity';
import { StorageService } from '../../common/modules/storage/storage.service';
import type { AnchorPayload } from './types/anchor-payload.type';
import type { PublicVerifyResult } from './types/public-verify-result.type';
import type {
  AnchorClientPort,
  AnchorResult,
} from './ports/anchor-client.port';

/**
 * Token de inyección para el cliente concreto (EthersAnchorClient, HttpAnchorClient, etc).
 * En tu AnchorModule registrás un provider con este token.
 */
export const ANCHOR_CLIENT = Symbol('ANCHOR_CLIENT');

@Injectable()
export class AnchorService {
  private readonly logger = new Logger(AnchorService.name);

  constructor(
    @InjectRepository(DocumentEntity)
    private readonly docsRepo: Repository<DocumentEntity>,
    private readonly storage: StorageService,
    // Inyectá un provider que implemente AnchorClientPort con el token ANCHOR_CLIENT
    // (ver nota al final)
    @Inject(ANCHOR_CLIENT)
    private readonly anchorClient: AnchorClientPort,
  ) {}

  /**
   * Obtiene un documento del tenant (o 404 si no existe).
   */
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
   * Calcula SHA-256 del contenido actual en storage (MinIO).
   * Devuelve hex lowercase (64 chars).
   */
  computeDocumentSha256Hex(doc: DocumentEntity): string {
    return doc.sha256PlainHex;
  }

  /**
   * Ancla el hash del documento a blockchain (vía AnchorClientPort).
   * NO persiste nada en DB (así compila aunque aún no agregues columnas de "anchor").
   * Si querés persistir, lo hacemos en el siguiente paso con campos nuevos o tabla `document_anchors`.
   */
  async anchorDocumentById(opts: {
    tenantId: string;
    documentId: string;
  }): Promise<{
    doc: DocumentEntity;
    payload: AnchorPayload;
    result: AnchorResult;
  }> {
    const doc = await this.getDocOrThrow(opts.tenantId, opts.documentId);

    const sha256Hex = this.computeDocumentSha256Hex(doc);

    const payload: AnchorPayload = {
      tenantId: doc.tenantId,
      vaultId: doc.vaultId,
      documentId: doc.id,
      sha256Hex,
    };

    const result = await this.anchorClient.anchorDocumentHash(payload);

    doc.anchorStatus = 'ANCHORED';
    doc.anchorTxHash = result.txHash;
    doc.anchoredAt = result.anchoredAt;
    doc.anchorChainId = result.chainId;
    doc.anchorRetries = 0;
    await this.docsRepo.save(doc);

    this.logger.log(
      `Anchored document ${doc.id} (tenant=${doc.tenantId}) tx=${result.txHash} chainId=${result.chainId}`,
    );

    return { doc, payload, result };
  }

  async processPending(): Promise<{ processed: number; failed: number }> {
    const pendingDocs = await this.docsRepo.find({
      where: { anchorStatus: 'PENDING' },
      take: 50,
    });

    let processed = 0;
    let failed = 0;

    const MAX_RETRIES = 5;

    for (const doc of pendingDocs) {
      try {
        await this.anchorDocumentById({
          tenantId: doc.tenantId,
          documentId: doc.id,
        });

        processed++;
      } catch (err: unknown) {
        // Incrementar contador de reintentos
        const currentRetry = doc.anchorRetries ?? 0;

        if (currentRetry < MAX_RETRIES) {
          // Backoff exponencial: 2^retry segundos
          const exponentialSeconds = Math.pow(2, currentRetry);
          doc.anchorRetries = currentRetry + 1;
          await this.docsRepo.save(doc);

          this.logger.warn(
            `Failed to anchor doc ${doc.id}, retry ${currentRetry + 1}/${MAX_RETRIES} in ${exponentialSeconds}s. Error: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        } else {
          // Máximos reintentos alcanzados
          doc.anchorStatus = 'FAILED';
          doc.anchorRetries = MAX_RETRIES;
          await this.docsRepo.save(doc);

          failed++;
          this.logger.error(
            `Anchor failed permanently for doc ${doc.id} after ${MAX_RETRIES} retries: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }
    }

    return { processed, failed };
  }

  async verifyDocument(documentId: string): Promise<{
    status: 'VALID' | 'MODIFIED' | 'NOT_ANCHORED';
    documentId: string;
    storedSha256: string;
    currentSha256: string;
    anchorTxHash: string | null;
    anchoredAt: Date | null;
    reason: string | null;
  }> {
    const doc = await this.docsRepo.findOne({
      where: { id: documentId },
    });

    if (!doc) {
      throw new NotFoundException('Document not found');
    }

    const currentSha256 = this.sha256Hex(
      await this.storage.getBuffer(doc.storageKey),
    );
    const storedSha256 = doc.sha256CipherHex ?? doc.sha256PlainHex;

    if (!doc.anchorTxHash || !doc.anchoredAt) {
      return {
        status: 'NOT_ANCHORED',
        documentId: doc.id,
        storedSha256,
        currentSha256,
        anchorTxHash: null,
        anchoredAt: null,
        reason:
          doc.anchorStatus === 'FAILED'
            ? `Anchor failed after ${doc.anchorRetries ?? 0} retries`
            : 'Document pending blockchain anchoring',
      };
    }

    if (currentSha256 !== storedSha256) {
      return {
        status: 'MODIFIED',
        documentId: doc.id,
        storedSha256,
        currentSha256,
        anchorTxHash: doc.anchorTxHash,
        anchoredAt: doc.anchoredAt,
        reason: 'Content hash mismatch - document may have been tampered',
      };
    }

    return {
      status: 'VALID',
      documentId: doc.id,
      storedSha256,
      currentSha256,
      anchorTxHash: doc.anchorTxHash,
      anchoredAt: doc.anchoredAt,
      reason: null,
    };
  }

  async verifyDocumentPublic(documentId: string): Promise<PublicVerifyResult> {
    const result = await this.verifyDocument(documentId);

    if (!result.anchorTxHash || !result.anchoredAt) {
      throw new NotFoundException('Public verification record not found');
    }

    if (result.status === 'NOT_ANCHORED') {
      throw new ForbiddenException(
        'Document is not available for public verification',
      );
    }

    return {
      status: result.status,
      documentId: result.documentId,
      anchorTxHash: result.anchorTxHash,
      anchoredAt: result.anchoredAt,
    };
  }

  /**
   * Helper: hash SHA-256 -> hex.
   */
  private sha256Hex(buf: Buffer): string {
    return createHash('sha256').update(buf).digest('hex');
  }
}
