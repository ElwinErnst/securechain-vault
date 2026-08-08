import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { z } from 'zod';

import { AppModule } from '../../src/app.module';
import { loadTestEnv } from '../utils/test-env';
import { http } from '../utils/http';
import { resetDb, seedBase, withDb } from '../utils/db';
import { parseBody } from '../utils/parse';
import { VaultResponseSchema } from '../utils/schemas/vault.schemas';
import {
  AuditEventFields,
  CURRENT_SCHEMA_VERSION,
  getAuditSerializer,
} from 'src/common/utils/audit-canonical.util';
import { buildZtHeaders } from '../utils/zt';
import { AuditService } from 'src/modules/audit/audit.service';

// ---- Audit hashing (re-use prod util if you have it; otherwise keep local) ----

// ---- Zod schemas for reader endpoints (adjust routes/shape if needed) ----
const AuditLogItemSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid().nullable().optional(),
  userId: z.string().uuid().nullable().optional(),
  scope: z.string(),
  seq: z.string(), // bigint as string
  action: z.string(),
  resourceType: z.string(),
  resourceId: z.string().nullable().optional(),
  outcome: z.enum(['SUCCESS', 'FAILURE']),
  httpStatus: z.number().int(),
  httpMethod: z.string(),
  httpPath: z.string(),
  prevHash: z.string().nullable(),
  eventHash: z.string(),
  chainHash: z.string(),
});

const AuditListResponseSchema = z.object({
  page: z.number().int(),
  limit: z.number().int(),
  total: z.number().int(),
  items: z.array(AuditLogItemSchema),
});

// ---- DB helpers using pg (consistent with your existing test infra) ----
type AuditRow = {
  id: string;
  tenant_id: string | null;
  user_id: string | null;
  scope: string;
  seq: string; // bigint
  action: string;
  resource_type: string;
  resource_id: string | null;
  outcome: 'SUCCESS' | 'FAILURE';
  http_status: number;
  http_method: string;
  http_path: string;
  ip: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown> | null;
  prev_hash: string | null;
  event_hash: string;
  chain_hash: string;
  schema_version: number;
  hash_alg: string;
  created_at: string;
};

async function getLastAuditForTenantAndUser(tenantId: string, userId: string) {
  return withDb(async (c) => {
    const res = await c.query<AuditRow>(
      `
      SELECT *
      FROM audit_logs
      WHERE tenant_id = $1 AND user_id = $2
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [tenantId, userId],
    );
    return res.rows[0] ?? null;
  });
}

async function getAuditByAction(action: string) {
  return withDb(async (c) => {
    const res = await c.query<AuditRow>(
      'SELECT * FROM audit_logs WHERE action = $1 ORDER BY created_at DESC LIMIT 1',
      [action],
    );
    return res.rows[0] ?? null;
  });
}

async function getLastTwoAuditsForTenant(tenantId: string) {
  return withDb(async (c) => {
    const res = await c.query<AuditRow>(
      `
      SELECT *
      FROM audit_logs
      WHERE tenant_id = $1
      ORDER BY created_at DESC
      LIMIT 2
      `,
      [tenantId],
    );
    return res.rows;
  });
}

describe('Audit e2e', () => {
  let app: INestApplication;

  let tenantId = '';
  let adminUserId = '';
  let userId = '';

  beforeAll(async () => {
    loadTestEnv();

    // ✅ IMPORTANT: boot Nest/TypeORM first (tables/migrations), then reset/seed
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
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('persists and hashes the same normalized metadata in current-schema writes', async () => {
    const action = `E2E_JSON_NORMALIZATION_${Date.now()}`;
    await app.get(AuditService).createChained({
      tenantId,
      userId: adminUserId,
      action,
      resourceType: 'test',
      resourceId: null,
      outcome: 'SUCCESS',
      httpStatus: 200,
      httpMethod: 'TEST',
      httpPath: '/test/audit-normalization',
      ip: null,
      userAgent: null,
      metadata: {
        date: new Date('2026-07-01T12:03:00.000Z'),
        omitted: undefined,
        values: [undefined, Number.NaN, -0],
      },
    });

    const row = await getAuditByAction(action);
    expect(row).toBeTruthy();
    expect(row!.metadata).toEqual({
      date: '2026-07-01T12:03:00.000Z',
      values: [null, null, 0],
    });
    expect(row!.schema_version).toBe(CURRENT_SCHEMA_VERSION);

    const serializer = getAuditSerializer(row!.schema_version)!;
    const expected = serializer.computeEventHash({
      id: row!.id,
      createdAt: row!.created_at,
      scope: row!.scope,
      seq: row!.seq,
      tenantId: row!.tenant_id,
      userId: row!.user_id,
      action: row!.action,
      resourceType: row!.resource_type,
      resourceId: row!.resource_id,
      outcome: row!.outcome,
      httpStatus: row!.http_status,
      httpMethod: row!.http_method,
      httpPath: row!.http_path,
      ip: row!.ip,
      userAgent: row!.user_agent,
      metadata: row!.metadata,
    });
    expect(row!.event_hash).toBe(expected);
  });

  it.each([
    ['NUL', { value: 'invalid\u0000value' }],
    ['unpaired surrogate', { value: 'invalid \ud800 value' }],
    ['invalid key', { '\udc00': 'value' }],
  ])(
    'rejects jsonb-incompatible metadata before insert: %s',
    async (_, metadata) => {
      const action = `E2E_JSON_REJECT_${Date.now()}_${Math.random()}`;
      await expect(
        app.get(AuditService).createChained({
          tenantId,
          userId: adminUserId,
          action,
          resourceType: 'test',
          resourceId: null,
          outcome: 'FAILURE',
          httpStatus: 400,
          httpMethod: 'TEST',
          httpPath: '/test/audit-invalid-json',
          ip: null,
          userAgent: null,
          metadata,
        }),
      ).rejects.toThrow('jsonb-compatible');
      await expect(getAuditByAction(action)).resolves.toBeNull();
    },
  );

  it('persists valid surrogate pairs and Unicode keys', async () => {
    const action = `E2E_JSON_UNICODE_${Date.now()}`;
    const metadata = { 'emoji-😀': ['music 𝄞', 'árbol'] };
    await app.get(AuditService).createChained({
      tenantId,
      userId: adminUserId,
      action,
      resourceType: 'test',
      resourceId: null,
      outcome: 'SUCCESS',
      httpStatus: 200,
      httpMethod: 'TEST',
      httpPath: '/test/audit-unicode',
      ip: null,
      userAgent: null,
      metadata,
    });
    expect((await getAuditByAction(action))?.metadata).toEqual(metadata);
  });

  it('creates SUCCESS audit log (VAULT_CREATE) with chained hashes', async () => {
    const res = await http(app)
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
      .send({ name: 'Audit Vault' })
      .expect(201);

    const vault = parseBody(res, VaultResponseSchema);
    expect(vault.tenantId).toBe(tenantId);

    const last = await getLastAuditForTenantAndUser(tenantId, adminUserId);
    expect(last).toBeTruthy();

    // If your @Audit() is not wired yet, these may be different.
    // Recommended: @Audit({ action: 'VAULT_CREATE', resourceType: 'vault' }) on POST /vaults
    expect(last.action).toBe('VAULT_CREATE');
    expect(last.resource_type).toBe('vault');
    expect(last.outcome).toBe('SUCCESS');
    expect(last.http_status).toBe(201);

    // ✅ recompute eventHash exactly like AuditService.createChained should
    // IMPORTANT: payload keys must match what you hash in prod
    const fields: AuditEventFields = {
      id: last.id,
      createdAt: last.created_at,
      scope: last.scope,
      seq: last.seq,
      tenantId: last.tenant_id,
      userId: last.user_id,
      action: last.action,
      resourceType: last.resource_type,
      resourceId: last.resource_id,
      outcome: last.outcome,
      httpStatus: last.http_status,
      httpMethod: last.http_method,
      httpPath: last.http_path,
      ip: last.ip,
      userAgent: last.user_agent,
      metadata: last.metadata,
    };

    const serializer = getAuditSerializer(last.schema_version);
    expect(serializer).not.toBeNull();
    expect(last.schema_version).toBe(CURRENT_SCHEMA_VERSION);
    expect(last.hash_alg).toBe(serializer!.hashAlg);

    const expectedEventHash = serializer!.computeEventHash(fields);
    expect(last.event_hash).toBe(expectedEventHash);

    const expectedChainHash = serializer!.computeChainHash(
      last.prev_hash,
      expectedEventHash,
    );
    expect(last.chain_hash).toBe(expectedChainHash);
  });

  it('creates FAILURE audit log when USER cannot create vault (403)', async () => {
    await http(app)
      .post('/vaults')
      .set(
        buildZtHeaders({
          method: 'POST',
          path: '/vaults',
          userId,
          tenantId,
          roles: ['USER'],
        }),
      )
      .send({ name: 'Forbidden Vault' })
      .expect(403);

    const last = await getLastAuditForTenantAndUser(tenantId, userId);
    expect(last).toBeTruthy();

    expect(last.action).toBe('VAULT_CREATE');
    expect(last.resource_type).toBe('vault');
    expect(last.outcome).toBe('FAILURE');
    expect(last.http_status).toBe(403);
  });

  it('chain continuity: seq increases and prevHash links to previous chainHash', async () => {
    await http(app)
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
      .send({ name: `Chain A ${Date.now()}` })
      .expect(201);

    await http(app)
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
      .send({ name: `Chain B ${Date.now()}` })
      .expect(201);

    const lastTwo = await getLastTwoAuditsForTenant(tenantId);
    expect(lastTwo.length).toBe(2);

    const newest = lastTwo[0];
    const prev = lastTwo[1];

    expect(BigInt(newest.seq)).toBe(BigInt(prev.seq) + 1n);
    expect(newest.prev_hash).toBe(prev.chain_hash);
  });

  it('tenant reader: /audit-logs returns paginated items for tenant and can filter by action', async () => {
    const listRes = await http(app)
      .get('/audit-logs?page=1&limit=20')
      .set(
        buildZtHeaders({
          method: 'GET',
          path: '/audit-logs?page=1&limit=20',
          userId: adminUserId,
          tenantId,
          roles: ['ADMIN'],
        }),
      )
      .expect(200);

    const list = parseBody(listRes, AuditListResponseSchema);

    expect(list.page).toBe(1);
    expect(list.limit).toBe(20);
    expect(list.total).toBeGreaterThanOrEqual(1);

    for (const item of list.items) {
      // tenant reader should only return tenant-scoped logs
      expect(item.scope).toBe(tenantId);
    }

    const filterRes = await http(app)
      .get('/audit-logs?action=VAULT_CREATE&page=1&limit=20')
      .set(
        buildZtHeaders({
          method: 'GET',
          path: '/audit-logs?action=VAULT_CREATE&page=1&limit=20',
          userId: adminUserId,
          tenantId,
          roles: ['ADMIN'],
        }),
      )
      .expect(200);

    const filtered = parseBody(filterRes, AuditListResponseSchema);
    for (const item of filtered.items) {
      expect(item.scope).toBe(tenantId);
      expect(item.action).toBe('VAULT_CREATE');
    }
  });

  it('global reader: /admin/audit-logs forbids global USER and allows global ADMIN', async () => {
    await http(app)
      .get('/admin/audit-logs?page=1&limit=10')
      .set(
        buildZtHeaders({
          method: 'GET',
          path: '/admin/audit-logs?page=1&limit=10',
          userId,
          tenantId,
          roles: ['USER'],
        }),
      )
      .expect(403);

    const adminRes = await http(app)
      .get('/admin/audit-logs?page=1&limit=10')
      .set(
        buildZtHeaders({
          method: 'GET',
          path: '/admin/audit-logs?page=1&limit=10',
          userId: adminUserId,
          tenantId,
          roles: ['ADMIN'],
        }),
      )
      .expect(200);

    const adminList = parseBody(adminRes, AuditListResponseSchema);
    expect(Array.isArray(adminList.items)).toBe(true);
  });
});
