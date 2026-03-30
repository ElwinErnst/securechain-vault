import { Client, type QueryResult } from 'pg';
import { randomUUID } from 'crypto';

type DbConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
};

function mustEnv(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function mustNumber(value: string, name: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid number for ${name}: "${value}"`);
  }
  return n;
}

export function getDbConfig(): DbConfig {
  return {
    host: mustEnv('DB_HOST', '127.0.0.1'),
    port: mustNumber(mustEnv('DB_PORT', '5433'), 'DB_PORT'),
    user: mustEnv('DB_USER', 'vault'),
    password: mustEnv('DB_PASSWORD', 'vault'),
    database: mustEnv('DB_NAME', 'vault'),
  };
}

export async function withDb<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const cfg = getDbConfig();
  const client = new Client(cfg);
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

type IdRow = { id: string };

async function insertReturningId(
  c: Client,
  sql: string,
  params: readonly unknown[] = [],
): Promise<string> {
  const res: QueryResult<IdRow> = await c.query<IdRow>(sql, [...params]);
  const row = res.rows[0];
  if (!row) throw new Error('Expected INSERT ... RETURNING id to return 1 row');
  return row.id;
}

export async function resetDb(): Promise<void> {
  await withDb(async (c) => {
    await c.query(`
      DO $$
      DECLARE
        t text;
      BEGIN
        FOREACH t IN ARRAY ARRAY[
          'audit_logs',
          'refresh_tokens',
          'user_roles',
          'users',
          'roles',
          'vaults',
          'tenant_members',
          'tenants'
        ]
        LOOP
          IF to_regclass('public.' || t) IS NOT NULL THEN
            EXECUTE format('TRUNCATE TABLE %I RESTART IDENTITY CASCADE;', t);
          END IF;
        END LOOP;
      END $$;
    `);
  });
}

export type SeedResult = {
  admin: { id: string };
  user: { id: string };
  member: { id: string };
  tenant: { id: string; slug: string };
};

export async function seedBase(): Promise<SeedResult> {
  return withDb(async (c) => {
    // Verify that tenants table exists (TypeORM should have created it)
    const tableCheck = await c.query<{ exists: boolean }>(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'tenants'
      ) as exists
    `);
    if (!tableCheck.rows[0]?.exists) {
      throw new Error(
        'tenants table does not exist. TypeORM may not have synchronized yet.',
      );
    }

    const adminUserId = randomUUID();
    const normalUserId = randomUUID();
    const memberUserId = randomUUID();

    // tenant
    const tenantId = await insertReturningId(
      c,
      `INSERT INTO tenants(name, slug, type, owner_user_id)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      ['Acme', 'acme', 'ORG', adminUserId],
    );

    // tenant membership (tenant RBAC)
    await c.query(
      `INSERT INTO tenant_members(tenant_id, user_id, role)
       VALUES ($1, $2, 'OWNER')`,
      [tenantId, adminUserId],
    );

    await c.query(
      `INSERT INTO tenant_members(tenant_id, user_id, role)
       VALUES ($1, $2, 'MEMBER')`,
      [tenantId, memberUserId],
    );

    await c.query(
      `INSERT INTO tenant_members(tenant_id, user_id, role)
   VALUES ($1, $2, 'MEMBER')`,
      [tenantId, normalUserId],
    );

    return {
      admin: { id: adminUserId },
      user: { id: normalUserId },
      member: { id: memberUserId },
      tenant: { id: tenantId, slug: 'acme' },
    };
  });
}
