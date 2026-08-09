import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';

import { DocumentEntity } from '../../database/entities/document.entity';
import { StorageService } from '../../common/modules/storage/storage.service';
import { AnchorService } from './anchor.service';
import type {
  AnchorClientPort,
  AnchorResult,
} from './ports/anchor-client.port';

/**
 * These tests pin down the "honest anchor" contract: when the anchoring backend
 * only simulates (no on-chain transaction), the service must never store or
 * expose anything that could be mistaken for real blockchain proof.
 */
describe('AnchorService (honest anchoring)', () => {
  const CONTENT = Buffer.from('%PDF-1.4\n% honest anchor\n', 'utf8');

  function makeDoc(overrides: Partial<DocumentEntity> = {}): DocumentEntity {
    return {
      id: 'doc-1',
      tenantId: 'tenant-1',
      vaultId: 'vault-1',
      storageKey: 'tenant-1/vault-1/doc-1',
      sha256PlainHex: 'a'.repeat(64),
      sha256CipherHex: null,
      anchorStatus: 'PENDING',
      anchorTxHash: null,
      anchoredAt: null,
      anchorChainId: null,
      anchorRetries: 0,
      ...overrides,
    } as DocumentEntity;
  }

  function makeService(opts: {
    doc: DocumentEntity;
    anchorResult?: AnchorResult;
    buffer?: Buffer;
  }): { service: AnchorService; save: jest.Mock } {
    const save = jest.fn(async (d: DocumentEntity) => d);
    const docsRepo = {
      findOne: jest.fn().mockResolvedValue(opts.doc),
      save,
    } as unknown as Repository<DocumentEntity>;

    const storage = {
      getBuffer: jest.fn().mockResolvedValue(opts.buffer ?? CONTENT),
    } as unknown as StorageService;

    const anchorClient: AnchorClientPort = {
      anchorDocumentHash: jest.fn().mockResolvedValue(
        opts.anchorResult ?? {
          simulated: true,
          txHash: null,
          chainId: 31337,
          anchoredAt: new Date(),
        },
      ),
    };

    return {
      service: new AnchorService(docsRepo, storage, anchorClient),
      save,
    };
  }

  it('marks a simulated anchor as SIMULATED and stores no tx hash', async () => {
    const doc = makeDoc();
    const { service } = makeService({ doc });

    const { doc: saved } = await service.anchorDocumentById({
      tenantId: doc.tenantId,
      documentId: doc.id,
    });

    expect(saved.anchorStatus).toBe('SIMULATED');
    expect(saved.anchorTxHash).toBeNull();
    expect(saved.anchoredAt).toBeNull();
  });

  it('stores a real tx hash only when the backend actually anchors', async () => {
    const doc = makeDoc();
    const anchoredAt = new Date();
    const { service } = makeService({
      doc,
      anchorResult: {
        simulated: false,
        txHash: '0xrealhash',
        chainId: 1,
        anchoredAt,
      },
    });

    const { doc: saved } = await service.anchorDocumentById({
      tenantId: doc.tenantId,
      documentId: doc.id,
    });

    expect(saved.anchorStatus).toBe('ANCHORED');
    expect(saved.anchorTxHash).toBe('0xrealhash');
    expect(saved.anchoredAt).toBe(anchoredAt);
  });

  it('reports a simulated document as NOT_ANCHORED with an honest reason', async () => {
    const doc = makeDoc({ anchorStatus: 'SIMULATED' });
    const { service } = makeService({ doc });

    const result = await service.verifyDocument(doc.id);

    expect(result.status).toBe('NOT_ANCHORED');
    expect(result.anchorTxHash).toBeNull();
    expect(result.reason).toMatch(/simulated/i);
  });

  it('refuses public verification for a simulated document', async () => {
    const doc = makeDoc({ anchorStatus: 'SIMULATED' });
    const { service } = makeService({ doc });

    await expect(service.verifyDocumentPublic(doc.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
