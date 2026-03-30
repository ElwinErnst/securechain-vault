export type CanonicalZtInput = {
  method: string;
  path: string;
  query: string;
  bodySha256Hex: string;
  userId: string;
  tenantId: string;
  roles: string;
  tsMs: number;
  nonce: string;
};

function normMethod(method: string): string {
  return method.trim().toUpperCase();
}

function normPath(path: string): string {
  const value = path.trim();
  if (!value) return '/';
  return value.startsWith('/') ? value : `/${value}`;
}

function normQuery(query: string): string {
  return query.trim().replace(/^\?/, '');
}

function normHex64(hex: string): string {
  const value = hex.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new Error('Invalid bodySha256Hex (expected 64 hex chars)');
  }
  return value;
}

export function canonicalizeZt(input: CanonicalZtInput): string {
  return [
    'v:1',
    `method:${normMethod(input.method)}`,
    `path:${normPath(input.path)}`,
    `query:${normQuery(input.query)}`,
    `body_sha256:${normHex64(input.bodySha256Hex)}`,
    `user_id:${input.userId}`,
    `tenant_id:${input.tenantId}`,
    `roles:${input.roles}`,
    `ts:${String(input.tsMs)}`,
    `nonce:${input.nonce}`,
  ].join('\n');
}
