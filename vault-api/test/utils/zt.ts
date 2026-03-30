import { createHash, createHmac, randomUUID } from 'crypto';
import { canonicalizeZt } from '../../src/common/zt/canonical';

function sha256Hex(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export function buildZtHeaders(input: {
  method: string;
  path: string;
  userId: string;
  tenantId: string;
  roles?: string[];
  body?: string | Buffer;
}): Record<string, string> {
  const tsMs = Date.now();
  const nonce = randomUUID();
  const roles = (input.roles ?? []).join(',');
  const bodySha256Hex = sha256Hex(input.body ?? '');
  const secret = process.env.ZT_HMAC_SECRET ?? 'test_zt_secret';
  const [path, query = ''] = input.path.split('?');

  const canonical = canonicalizeZt({
    method: input.method,
    path: path ?? '/',
    query,
    bodySha256Hex,
    userId: input.userId,
    tenantId: input.tenantId,
    roles,
    tsMs,
    nonce,
  });

  const signature = createHmac('sha256', secret)
    .update(canonical)
    .digest('hex');

  return {
    'x-zt-v': '1',
    'x-zt-user-id': input.userId,
    'x-zt-tenant-id': input.tenantId,
    'x-zt-roles': roles,
    'x-zt-ts': String(tsMs),
    'x-zt-nonce': nonce,
    'x-zt-body-sha256': bodySha256Hex,
    'x-zt-sig': signature,
  };
}
