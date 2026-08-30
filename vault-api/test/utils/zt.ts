import { createHash, createHmac, randomUUID } from 'crypto';
import {
  canonicalizeZt,
  canonicalizeZtV2,
} from '../../src/common/zt/canonical';
import {
  generateEd25519KeyPair,
  signEd25519,
} from '../../src/common/zt/ed25519';

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

// --- Asymmetric v2 (Ed25519) test signer -----------------------------------
// A per-process key pair stands in for the zerotrust-api signing key. Set
// `ZT_VERIFY_PUBLIC_KEYS = ztTestPublicKeysJson` (before app init) so the guard
// trusts this key.
export const ZT_TEST_KID = 'zt-test-kid';
const ztTestKeys = generateEd25519KeyPair();

export const ztTestPublicKeysJson = JSON.stringify({
  [ZT_TEST_KID]: ztTestKeys.publicKey
    .export({ type: 'spki', format: 'pem' })
    .toString(),
});

export function buildZtV2Headers(input: {
  method: string;
  path: string;
  userId: string;
  tenantId: string;
  roles?: string[];
  body?: string | Buffer;
  kid?: string;
  sign?: boolean;
}): Record<string, string> {
  const tsMs = Date.now();
  const nonce = randomUUID();
  const roles = (input.roles ?? []).join(',');
  const bodySha256Hex = sha256Hex(input.body ?? '');
  const kid = input.kid ?? ZT_TEST_KID;
  const [path, query = ''] = input.path.split('?');

  const canonical = canonicalizeZtV2({
    alg: 'ed25519',
    kid,
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
  // `sign: false` produces a valid-shaped but wrong signature (unknown-kid case).
  const signature =
    input.sign === false
      ? signEd25519(generateEd25519KeyPair().privateKey, canonical)
      : signEd25519(ztTestKeys.privateKey, canonical);

  return {
    'x-zt-v': '2',
    'x-zt-alg': 'ed25519',
    'x-zt-kid': kid,
    'x-zt-user-id': input.userId,
    'x-zt-tenant-id': input.tenantId,
    'x-zt-roles': roles,
    'x-zt-ts': String(tsMs),
    'x-zt-nonce': nonce,
    'x-zt-body-sha256': bodySha256Hex,
    'x-zt-sig': signature,
  };
}
