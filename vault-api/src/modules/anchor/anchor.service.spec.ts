import { createHash } from 'crypto';

import { NotFoundException } from '@nestjs/common';
import { EntityManager, Repository } from 'typeorm';

import { DocumentEntity } from '../../database/entities/document.entity';
import { AnchorBatchEntity } from '../../database/entities/anchor-batch.entity';
import { StorageService } from '../../common/modules/storage/storage.service';
import { AnchorService } from './anchor.service';
import type {
  TimestampClientPort,
  TimestampResult,
} from '../../common/modules/timestamp/timestamp-client.port';
import type { TimestampVerifierPort } from '../../common/modules/timestamp/timestamp-verifier.port';
import { buildMerkleTree } from './merkle.util';

/**
 * These tests pin the Merkle-batch anchoring contract:
 * - a simulated timestamp never yields a real anchor or public proof;
 * - a real timestamp records the batch + per-document inclusion proof;
 * - verification recomputes the leaf, walks the proof to the anchored root, and
 *   detects tampered content.
 */
describe('AnchorService (Merkle batch anchoring)', () => {
  const SIMULATED: TimestampResult = {
    simulated: true,
    tokenB64: null,
    tsaUrl: null,
    serial: null,
    timestampedAt: new Date('2026-01-01T00:00:00Z'),
  };

  const REAL: TimestampResult = {
    simulated: false,
    tokenB64: 'dG9rZW4=',
    tsaUrl: 'https://tsa.example/tsr',
    serial: '42',
    timestampedAt: new Date('2026-02-02T00:00:00Z'),
  };

  function sha256Hex(buf: Buffer): string {
    return createHash('sha256').update(buf).digest('hex');
  }

  function makeDoc(overrides: Partial<DocumentEntity> = {}): DocumentEntity {
    return {
      id: 'doc-1',
      tenantId: 'tenant-1',
      vaultId: 'vault-1',
      storageKey: 'tenant-1/vault-1/doc-1',
      sha256PlainHex: 'a'.repeat(64),
      sha256CipherHex: null,
      anchorStatus: 'PENDING',
      anchoredAt: null,
      anchorRetries: 0,
      anchorBatchId: null,
      anchorLeafIndex: null,
      anchorProof: null,
      ...overrides,
    } as DocumentEntity;
  }

  function makeService(opts: {
    doc?: DocumentEntity | null;
    pending?: DocumentEntity[];
    batch?: AnchorBatchEntity | null;
    buffer?: Buffer;
    ts?: TimestampResult;
    tokenValid?: boolean;
  }): { service: AnchorService; savedBatch: jest.Mock; savedDocs: jest.Mock } {
    const savedBatch = jest.fn((b: AnchorBatchEntity) => ({
      ...b,
      id: 'batch-1',
    }));
    const savedDocs = jest.fn((d: unknown) => d);

    const manager = {
      transaction: jest.fn((work: (em: EntityManager) => unknown) =>
        work({
          getRepository: (entity: unknown) =>
            entity === AnchorBatchEntity
              ? { create: (b: AnchorBatchEntity) => b, save: savedBatch }
              : { save: savedDocs },
        } as unknown as EntityManager),
      ),
    };

    const docsRepo = {
      findOne: jest.fn().mockResolvedValue(opts.doc ?? null),
      find: jest.fn().mockResolvedValue(opts.pending ?? []),
      manager,
    } as unknown as Repository<DocumentEntity>;

    const batchRepo = {
      findOne: jest.fn().mockResolvedValue(opts.batch ?? null),
    } as unknown as Repository<AnchorBatchEntity>;

    const storage = {
      getBuffer: jest.fn().mockResolvedValue(opts.buffer ?? Buffer.from('x')),
    } as unknown as StorageService;

    const timestampClient: TimestampClientPort = {
      timestampRoot: jest.fn().mockResolvedValue(opts.ts ?? SIMULATED),
    };

    const tokenVerifier: TimestampVerifierPort = {
      verifyToken: jest
        .fn()
        .mockResolvedValue(
          opts.tokenValid === false
            ? { valid: false, reason: 'token signature did not verify' }
            : { valid: true, reason: null },
        ),
    };

    return {
      service: new AnchorService(
        docsRepo,
        batchRepo,
        storage,
        timestampClient,
        tokenVerifier,
      ),
      savedBatch,
      savedDocs,
    };
  }

  it('records a simulated batch as SIMULATED with no token and no anchored time', async () => {
    const doc = makeDoc();
    const { service } = makeService({ doc, ts: SIMULATED });

    const { doc: saved, batch } = await service.anchorDocumentById({
      tenantId: doc.tenantId,
      documentId: doc.id,
    });

    expect(batch.status).toBe('SIMULATED');
    expect(batch.timestampTokenB64).toBeNull();
    expect(saved.anchorStatus).toBe('SIMULATED');
    expect(saved.anchoredAt).toBeNull();
    expect(saved.anchorBatchId).toBe('batch-1');
    expect(Array.isArray(saved.anchorProof)).toBe(true);
  });

  it('records a real batch as TIMESTAMPED with the token and inclusion proof', async () => {
    const doc = makeDoc();
    const { service } = makeService({ doc, ts: REAL });

    const { doc: saved, batch } = await service.anchorDocumentById({
      tenantId: doc.tenantId,
      documentId: doc.id,
    });

    expect(batch.status).toBe('TIMESTAMPED');
    expect(batch.timestampTokenB64).toBe(REAL.tokenB64);
    expect(batch.timestampedAt).toEqual(REAL.timestampedAt);
    expect(saved.anchorStatus).toBe('ANCHORED');
    expect(saved.anchoredAt).toEqual(REAL.timestampedAt);
    expect(saved.anchorBatchId).toBe('batch-1');
  });

  it('verifies a document included in a real anchored batch as VALID', async () => {
    const buf = Buffer.from('valid document bytes');
    const leafValue = sha256Hex(buf);
    const tree = buildMerkleTree([leafValue]);

    const doc = makeDoc({
      sha256CipherHex: leafValue,
      anchorStatus: 'ANCHORED',
      anchorBatchId: 'batch-1',
      anchorLeafIndex: 0,
      anchorProof: tree.proofFor(0),
      anchoredAt: REAL.timestampedAt,
    });
    const batch = {
      id: 'batch-1',
      rootHex: tree.root,
      leafCount: 1,
      status: 'TIMESTAMPED',
      timestampTokenB64: REAL.tokenB64,
      tsaUrl: REAL.tsaUrl,
      tsaSerial: REAL.serial,
      timestampedAt: REAL.timestampedAt,
      retries: 0,
      createdAt: new Date(),
    } as AnchorBatchEntity;

    const { service } = makeService({ doc, batch, buffer: buf });
    const result = await service.verifyDocument(doc.id);

    expect(result.status).toBe('VALID');
    expect(result.rootHex).toBe(tree.root);
    expect(result.reason).toBeNull();
  });

  it('reports MODIFIED when the timestamp token fails verification', async () => {
    const buf = Buffer.from('valid document bytes');
    const leafValue = sha256Hex(buf);
    const tree = buildMerkleTree([leafValue]);

    const doc = makeDoc({
      sha256CipherHex: leafValue,
      anchorStatus: 'ANCHORED',
      anchorBatchId: 'batch-1',
      anchorProof: tree.proofFor(0),
      anchoredAt: REAL.timestampedAt,
    });
    const batch = {
      id: 'batch-1',
      rootHex: tree.root,
      status: 'TIMESTAMPED',
      timestampTokenB64: 'dG9rZW4=',
      timestampedAt: REAL.timestampedAt,
    } as AnchorBatchEntity;

    // Content and inclusion proof are fine, but the token does not verify.
    const { service } = makeService({
      doc,
      batch,
      buffer: buf,
      tokenValid: false,
    });
    const result = await service.verifyDocument(doc.id);

    expect(result.status).toBe('MODIFIED');
    expect(result.reason).toMatch(/token failed verification/i);
  });

  it('reports MODIFIED when stored bytes no longer match the committed hash', async () => {
    const leafValue = sha256Hex(Buffer.from('original bytes'));
    const tree = buildMerkleTree([leafValue]);

    const doc = makeDoc({
      sha256CipherHex: leafValue,
      anchorStatus: 'ANCHORED',
      anchorBatchId: 'batch-1',
      anchorProof: tree.proofFor(0),
      anchoredAt: REAL.timestampedAt,
    });
    const batch = {
      id: 'batch-1',
      rootHex: tree.root,
      status: 'TIMESTAMPED',
      timestampedAt: REAL.timestampedAt,
    } as AnchorBatchEntity;

    // Storage now returns different bytes than the committed hash.
    const { service } = makeService({
      doc,
      batch,
      buffer: Buffer.from('tampered bytes'),
    });
    const result = await service.verifyDocument(doc.id);

    expect(result.status).toBe('MODIFIED');
    expect(result.reason).toMatch(/tamper/i);
  });

  it('refuses public verification for a simulated document', async () => {
    const doc = makeDoc({
      anchorStatus: 'SIMULATED',
      anchorBatchId: 'batch-1',
    });
    const batch = {
      id: 'batch-1',
      rootHex: 'b'.repeat(64),
      status: 'SIMULATED',
      timestampedAt: null,
    } as AnchorBatchEntity;

    const { service } = makeService({ doc, batch });

    await expect(service.verifyDocumentPublic(doc.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
