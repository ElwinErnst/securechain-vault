import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { z } from 'zod';
import type { Response as SuperAgentResponse } from 'superagent';

import { AppModule } from '../../src/app.module';
import { loadTestEnv } from '../utils/test-env';
import { http } from '../utils/http';
import { resetDb, seedBase, withDb } from '../utils/db';
import { parseBody } from '../utils/parse';
import { VaultResponseSchema } from '../utils/schemas/vault.schemas';
import { buildZtHeaders } from '../utils/zt';

/* ------------------------------
   Zod Schemas
-------------------------------- */

const DocumentItemSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  vaultId: z.string().uuid(),
  originalName: z.string(),
  storedName: z.string(),
  mime: z.string(),
  sizeBytes: z.string(), // bigint -> string
  createdAt: z.string(),
});

const DocumentListSchema = z.array(DocumentItemSchema);

/* ------------------------------
   Binary parser (for downloads)
--------------------------------
   supertest/superagent .parse expects:
   (res: superagent.Response, callback: (err: Error | null, body: Buffer) => void) => void
-------------------------------- */

function binaryParser(
  res: SuperAgentResponse,
  callback: (err: Error | null, data: Buffer) => void,
): void {
  const chunks: Buffer[] = [];

  res.on('data', (chunk: unknown) => {
    if (Buffer.isBuffer(chunk)) {
      chunks.push(chunk);
      return;
    }

    if (chunk instanceof Uint8Array) {
      chunks.push(Buffer.from(chunk));
      return;
    }

    if (typeof chunk === 'string') {
      chunks.push(Buffer.from(chunk));
      return;
    }

    // fallback defensivo
    chunks.push(Buffer.from(String(chunk)));
  });

  res.on('end', () => callback(null, Buffer.concat(chunks)));

  res.on('error', (e: unknown) => {
    callback(e instanceof Error ? e : new Error(String(e)), Buffer.alloc(0));
  });
}

/* ------------------------------
   DB Helper
-------------------------------- */

type DocRow = {
  id: string;
  tenant_id: string;
  vault_id: string;
  original_name: string;
  stored_name: string;
  mime: string;
  size_bytes: string;
  storage_key: string;
  created_at: string;
};

async function getDocById(id: string) {
  return withDb(async (c) => {
    const res = await c.query<DocRow>(
      `SELECT * FROM documents WHERE id = $1 LIMIT 1`,
      [id],
    );
    return res.rows[0] ?? null;
  });
}

/* ==============================
   TESTS
================================ */

describe('Documents e2e', () => {
  let app: INestApplication;

  let adminUserId = '';
  let userId = '';
  let tenantId = '';
  let vaultId = '';

  beforeAll(async () => {
    loadTestEnv();

    const modRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = modRef.createNestApplication();
    await app.init();

    await resetDb();
    const seeded = await seedBase();

    tenantId = seeded.tenant.id;
    adminUserId = seeded.admin.id;
    userId = seeded.user.id;

    /* ---- CREATE VAULT ---- */

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
      .send({ name: `Docs Vault ${Date.now()}` })
      .expect(201);

    const vault = parseBody(vaultRes, VaultResponseSchema);
    vaultId = vault.id;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  /* ==============================
     UPLOAD
  ================================= */

  it('ADMIN can upload PDF document', async () => {
    const pdfBuf = Buffer.from('%PDF-1.4\n% fake pdf\n', 'utf8');

    const res = await http(app)
      .post(
        `/documents?vaultId=${encodeURIComponent(vaultId)}&name=${encodeURIComponent('Contrato.pdf')}`,
      )
      .set(
        buildZtHeaders({
          method: 'POST',
          path: `/documents?vaultId=${encodeURIComponent(vaultId)}&name=${encodeURIComponent('Contrato.pdf')}`,
          userId: adminUserId,
          tenantId,
          roles: ['ADMIN'],
        }),
      )
      .attach('file', pdfBuf, {
        filename: 'contrato.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);

    const doc = parseBody(res, DocumentItemSchema);

    expect(doc.tenantId).toBe(tenantId);
    expect(doc.vaultId).toBe(vaultId);
    expect(doc.mime).toBe('application/pdf');

    const db = await getDocById(doc.id);
    expect(db).toBeTruthy();
    expect(db?.tenant_id).toBe(tenantId);
    expect(db?.vault_id).toBe(vaultId);
  });

  it('MEMBER cannot upload (403)', async () => {
    const pdfBuf = Buffer.from('%PDF-1.4\n% fake pdf\n', 'utf8');

    await http(app)
      .post(`/documents?vaultId=${encodeURIComponent(vaultId)}`)
      .set(
        buildZtHeaders({
          method: 'POST',
          path: `/documents?vaultId=${encodeURIComponent(vaultId)}`,
          userId,
          tenantId,
          roles: ['USER'],
        }),
      )
      .attach('file', pdfBuf, {
        filename: 'x.pdf',
        contentType: 'application/pdf',
      })
      .expect(403);
  });

  it('rejects invalid mimetype (400)', async () => {
    const buf = Buffer.from('malware', 'utf8');

    await http(app)
      .post(`/documents?vaultId=${encodeURIComponent(vaultId)}`)
      .set(
        buildZtHeaders({
          method: 'POST',
          path: `/documents?vaultId=${encodeURIComponent(vaultId)}`,
          userId: adminUserId,
          tenantId,
          roles: ['ADMIN'],
        }),
      )
      .attach('file', buf, {
        filename: 'virus.exe',
        contentType: 'application/x-msdownload',
      })
      .expect(400);
  });

  /* ==============================
     LIST
  ================================= */

  it('lists documents for tenant + vault', async () => {
    const res = await http(app)
      .get(`/documents?vaultId=${encodeURIComponent(vaultId)}`)
      .set(
        buildZtHeaders({
          method: 'GET',
          path: `/documents?vaultId=${encodeURIComponent(vaultId)}`,
          userId: adminUserId,
          tenantId,
          roles: ['ADMIN'],
        }),
      )
      .expect(200);

    const items = parseBody(res, DocumentListSchema);

    expect(Array.isArray(items)).toBe(true);
    for (const it of items) {
      expect(it.tenantId).toBe(tenantId);
      expect(it.vaultId).toBe(vaultId);
    }
  });

  /* ==============================
     DOWNLOAD
  ================================= */

  it('downloads document with correct bytes', async () => {
    const pdfBuf = Buffer.from('%PDF-1.4\n% fake pdf download\n', 'utf8');

    const upRes = await http(app)
      .post(`/documents?vaultId=${encodeURIComponent(vaultId)}`)
      .set(
        buildZtHeaders({
          method: 'POST',
          path: `/documents?vaultId=${encodeURIComponent(vaultId)}`,
          userId: adminUserId,
          tenantId,
          roles: ['ADMIN'],
        }),
      )
      .attach('file', pdfBuf, {
        filename: 'dl.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);

    const doc = parseBody(upRes, DocumentItemSchema);

    const dlRes = await http(app)
      .get(`/documents/${doc.id}/download`)
      .set(
        buildZtHeaders({
          method: 'GET',
          path: `/documents/${doc.id}/download`,
          userId: adminUserId,
          tenantId,
          roles: ['ADMIN'],
        }),
      )
      .buffer(true)
      .parse(binaryParser)
      .expect(200);

    expect(String(dlRes.headers['content-type'])).toContain('application/pdf');
    expect(String(dlRes.headers['content-disposition'])).toContain(
      'attachment',
    );

    const body: unknown = dlRes.body;
    expect(Buffer.isBuffer(body)).toBe(true);
    expect(Buffer.compare(body as Buffer, pdfBuf)).toBe(0);
  });

  /* ==============================
     DELETE
  ================================= */

  it('ADMIN can delete document', async () => {
    const pdfBuf = Buffer.from('%PDF-1.4\n% fake pdf delete\n', 'utf8');

    const upRes = await http(app)
      .post(`/documents?vaultId=${encodeURIComponent(vaultId)}`)
      .set(
        buildZtHeaders({
          method: 'POST',
          path: `/documents?vaultId=${encodeURIComponent(vaultId)}`,
          userId: adminUserId,
          tenantId,
          roles: ['ADMIN'],
        }),
      )
      .attach('file', pdfBuf, {
        filename: 'del.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);

    const doc = parseBody(upRes, DocumentItemSchema);

    await http(app)
      .delete(`/documents/${doc.id}`)
      .set(
        buildZtHeaders({
          method: 'DELETE',
          path: `/documents/${doc.id}`,
          userId: adminUserId,
          tenantId,
          roles: ['ADMIN'],
        }),
      )
      .expect(200);

    await http(app)
      .get(`/documents/${doc.id}/download`)
      .set(
        buildZtHeaders({
          method: 'GET',
          path: `/documents/${doc.id}/download`,
          userId: adminUserId,
          tenantId,
          roles: ['ADMIN'],
        }),
      )
      .expect(404);
  });

  it('MEMBER cannot delete (403)', async () => {
    const pdfBuf = Buffer.from('%PDF-1.4\n% fake pdf member delete\n', 'utf8');

    const upRes = await http(app)
      .post(`/documents?vaultId=${encodeURIComponent(vaultId)}`)
      .set(
        buildZtHeaders({
          method: 'POST',
          path: `/documents?vaultId=${encodeURIComponent(vaultId)}`,
          userId: adminUserId,
          tenantId,
          roles: ['ADMIN'],
        }),
      )
      .attach('file', pdfBuf, {
        filename: 'x.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);

    const doc = parseBody(upRes, DocumentItemSchema);

    await http(app)
      .delete(`/documents/${doc.id}`)
      .set(
        buildZtHeaders({
          method: 'DELETE',
          path: `/documents/${doc.id}`,
          userId,
          tenantId,
          roles: ['USER'],
        }),
      )
      .expect(403);
  });
});
