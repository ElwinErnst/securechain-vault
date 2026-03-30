import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { z } from 'zod';

import { AppModule } from '../../src/app.module';
import { loadTestEnv } from '../utils/test-env';
import { http } from '../utils/http';
import { resetDb, seedBase } from '../utils/db';
import { VaultResponseSchema } from '../utils/schemas/vault.schemas';
import { buildZtHeaders } from '../utils/zt';

/* ------------------------------
   Schemas
-------------------------------- */

const DocumentItemSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  vaultId: z.string().uuid(),
  originalName: z.string(),
  storedName: z.string(),
  mime: z.string(),
  sizeBytes: z.string(),
  createdAt: z.string(),
});

const PublicVerifyResponseSchema = z.object({
  status: z.enum(['VALID', 'MODIFIED', 'NOT_ANCHORED']),
  documentId: z.string().uuid(),
  storedSha256: z.string(),
  currentSha256: z.string(),
  anchorTxHash: z.string().nullable(),
  anchoredAt: z.string().nullable(),
});

type VaultResponse = z.infer<typeof VaultResponseSchema>;
type DocumentItem = z.infer<typeof DocumentItemSchema>;
type PublicVerifyResponse = z.infer<typeof PublicVerifyResponseSchema>;

describe('Public Verify e2e', () => {
  let app: INestApplication;

  let adminUserId = '';
  let tenantId = '';
  let vaultId = '';
  let documentId = '';

  beforeAll(async () => {
    loadTestEnv();

    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = mod.createNestApplication();
    await app.init();

    await resetDb();
    const seeded = await seedBase();
    tenantId = seeded.tenant.id;
    adminUserId = seeded.admin.id;

    const vaultRes = await http(app)
      .post('/vaults')
      .set(
        buildZtHeaders({
          method: 'POST',
          path: '/vaults',
          userId: adminUserId,
          tenantId,
          roles: ['ADMIN'],
        }),
      )
      .send({ name: `Verify Vault ${Date.now()}` })
      .expect(201);

    const vault: VaultResponse = VaultResponseSchema.parse(
      vaultRes.body as unknown,
    );
    vaultId = vault.id;

    const pdfBuf = Buffer.from('%PDF-1.4\n% verify pdf\n', 'utf8');

    const uploadRes = await http(app)
      .post(`/documents?vaultId=${vaultId}`)
      .set(
        buildZtHeaders({
          method: 'POST',
          path: `/documents?vaultId=${vaultId}`,
          userId: adminUserId,
          tenantId,
          roles: ['ADMIN'],
        }),
      )
      .attach('file', pdfBuf, {
        filename: 'verify.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);

    const doc: DocumentItem = DocumentItemSchema.parse(
      uploadRes.body as unknown,
    );

    documentId = doc.id;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('returns NOT_ANCHORED initially', async () => {
    const res = await http(app)
      .get(`/public/verify?documentId=${documentId}`)
      .expect(200);

    const body: PublicVerifyResponse = PublicVerifyResponseSchema.parse(
      res.body as unknown,
    );

    expect(body.status).toBe('NOT_ANCHORED');
    expect(body.documentId).toBe(documentId);
    expect(body.anchorTxHash).toBeNull();
    expect(body.anchoredAt).toBeNull();
  });
});
