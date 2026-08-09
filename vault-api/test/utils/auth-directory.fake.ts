import { withDb } from './db';

/**
 * Test double for AuthDirectoryService. The real service resolves tenants,
 * memberships and entitlements over HTTP from the external auth-api, which is
 * not running in e2e — so every creation endpoint 500s. This fake answers from
 * the same database the tests seed (tenants / tenant_members), so roles and
 * membership stay consistent with seedBase with no per-test configuration, and
 * grants full entitlements so plan gating never blocks the happy path.
 */

const FULL_ENTITLEMENTS = {
  planCode: 'TEST',
  features: {
    vaults: true,
    ztPolicies: true,
    digitalNotary: true,
    auditExport: true,
    customBranding: true,
    sso: true,
    apiAuth: true,
    apiVault: true,
    apiZeroTrust: true,
  },
  limits: {
    maxVaults: null,
    maxUsers: null,
    auditRetentionDays: null,
    monthlyNotaryRequests: null,
  },
  addonsAllowed: [] as string[],
  apiAddons: [] as Array<'AUTH_API' | 'VAULT_API' | 'ZERO_TRUST_API'>,
  source: 'legacy_defaults' as const,
};

type TenantRow = { id: string; name: string; slug: string };

async function findTenant(tenantId: string): Promise<TenantRow | null> {
  return withDb(async (c) => {
    const res = await c.query<TenantRow>(
      'SELECT id, name, slug FROM tenants WHERE id = $1',
      [tenantId],
    );
    return res.rows[0] ?? null;
  });
}

export function createFakeAuthDirectory() {
  return {
    async getMembership(userId: string, tenantId: string) {
      return withDb(async (c) => {
        const res = await c.query<{ role: string }>(
          'SELECT role FROM tenant_members WHERE user_id = $1 AND tenant_id = $2',
          [userId, tenantId],
        );
        const row = res.rows[0];
        return row
          ? { userId, tenantId, role: row.role, isActive: true }
          : null;
      });
    },

    async getTenant(tenantId: string) {
      const tenant = await findTenant(tenantId);
      return tenant
        ? {
            id: tenant.id,
            name: tenant.name,
            slug: tenant.slug,
            planCode: 'TEST',
            isActive: true,
            entitlements: FULL_ENTITLEMENTS,
          }
        : null;
    },

    async getTenantEntitlements(tenantId: string) {
      const tenant = await findTenant(tenantId);
      return tenant ? FULL_ENTITLEMENTS : null;
    },

    async listUserTenants(userId: string) {
      return withDb(async (c) => {
        const res = await c.query<TenantRow & { role: string }>(
          `SELECT t.id, t.name, t.slug, tm.role
             FROM tenants t
             JOIN tenant_members tm ON tm.tenant_id = t.id
            WHERE tm.user_id = $1`,
          [userId],
        );
        const now = new Date().toISOString();
        return res.rows.map((row) => ({
          id: row.id,
          name: row.name,
          slug: row.slug,
          planCode: 'TEST',
          isActive: true,
          role: row.role,
          membershipActive: true,
          createdAt: now,
          updatedAt: now,
        }));
      });
    },
  };
}
