import { createHash, createHmac, randomUUID } from 'crypto';
import { canonicalizeZt, canonicalizeZtV2 } from './canonical';
import { generateEd25519KeyPair, signEd25519 } from './ed25519';
import { loadPublicKeyring, type PublicKeyring } from './keyring';
import { verifyZtRequest } from './zt-verify';

const KID = 'zt-2026-08';
const HMAC_SECRET = 'test_zt_secret';

function sha256Hex(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

const keys = generateEd25519KeyPair();
const publicKeyPem = keys.publicKey
  .export({ type: 'spki', format: 'pem' })
  .toString();
const keyring: PublicKeyring = loadPublicKeyring(
  JSON.stringify({ [KID]: publicKeyPem }),
);

type BuildOpts = {
  method?: string;
  path?: string;
  query?: string;
  body?: Buffer;
  roles?: string;
  tsMs?: number;
  nonce?: string;
  kid?: string;
};

function buildV2Headers(opts: BuildOpts = {}): Record<string, string> {
  const method = opts.method ?? 'POST';
  const path = opts.path ?? '/documents';
  const query = opts.query ?? '';
  const body = opts.body ?? Buffer.alloc(0);
  const roles = opts.roles ?? 'ADMIN';
  const tsMs = opts.tsMs ?? Date.now();
  const nonce = opts.nonce ?? randomUUID();
  const kid = opts.kid ?? KID;
  const bodySha256Hex = sha256Hex(body);

  const canonical = canonicalizeZtV2({
    alg: 'ed25519',
    kid,
    method,
    path,
    query,
    bodySha256Hex,
    userId: 'user-1',
    tenantId: 'tenant-1',
    roles,
    tsMs,
    nonce,
  });
  const sig = signEd25519(keys.privateKey, canonical);

  return {
    'x-zt-v': '2',
    'x-zt-alg': 'ed25519',
    'x-zt-kid': kid,
    'x-zt-user-id': 'user-1',
    'x-zt-tenant-id': 'tenant-1',
    'x-zt-roles': roles,
    'x-zt-ts': String(tsMs),
    'x-zt-nonce': nonce,
    'x-zt-body-sha256': bodySha256Hex,
    'x-zt-sig': sig,
  };
}

function buildV1Headers(opts: BuildOpts = {}): Record<string, string> {
  const method = opts.method ?? 'GET';
  const path = opts.path ?? '/documents';
  const query = opts.query ?? '';
  const body = opts.body ?? Buffer.alloc(0);
  const roles = opts.roles ?? 'ADMIN';
  const tsMs = opts.tsMs ?? Date.now();
  const nonce = opts.nonce ?? randomUUID();
  const bodySha256Hex = sha256Hex(body);

  const canonical = canonicalizeZt({
    method,
    path,
    query,
    bodySha256Hex,
    userId: 'user-1',
    tenantId: 'tenant-1',
    roles,
    tsMs,
    nonce,
  });
  const sig = createHmac('sha256', HMAC_SECRET).update(canonical).digest('hex');

  return {
    'x-zt-v': '1',
    'x-zt-user-id': 'user-1',
    'x-zt-tenant-id': 'tenant-1',
    'x-zt-roles': roles,
    'x-zt-ts': String(tsMs),
    'x-zt-nonce': nonce,
    'x-zt-body-sha256': bodySha256Hex,
    'x-zt-sig': sig,
  };
}

const base = {
  method: 'POST',
  path: '/documents',
  query: '',
  maxSkewMs: 30_000,
  keyring,
  hmacSecret: HMAC_SECRET,
  acceptV1Hmac: true,
};

describe('verifyZtRequest v2 (Ed25519)', () => {
  it('accepts a valid asymmetric request', () => {
    const body = Buffer.from('{"hello":"world"}');
    const headers = buildV2Headers({ body });
    const result = verifyZtRequest({ ...base, headers, body });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.userId).toBe('user-1');
      expect(result.tenantId).toBe('tenant-1');
      expect(result.roles).toEqual(['ADMIN']);
      expect(result.replayKey).toBe(`user-1:${headers['x-zt-nonce']}`);
    }
  });

  it('rejects an invalid signature', () => {
    const headers = buildV2Headers();
    headers['x-zt-sig'] = signEd25519(
      generateEd25519KeyPair().privateKey,
      'tampered',
    );
    const result = verifyZtRequest({ ...base, headers });
    expect(result).toMatchObject({ ok: false, reason: 'Invalid signature' });
  });

  it('rejects an expired timestamp', () => {
    const headers = buildV2Headers({ tsMs: Date.now() - 60_000 });
    const result = verifyZtRequest({ ...base, headers });
    expect(result).toMatchObject({
      ok: false,
      reason: 'Timestamp outside allowed window',
    });
  });

  it('rejects a modified body (body hash mismatch)', () => {
    const signedBody = Buffer.from('{"amount":1}');
    const headers = buildV2Headers({ body: signedBody });
    const tamperedBody = Buffer.from('{"amount":9999}');
    const result = verifyZtRequest({ ...base, headers, body: tamperedBody });
    expect(result).toMatchObject({ ok: false, reason: 'Body hash mismatch' });
  });

  it('rejects an unknown key id', () => {
    const headers = buildV2Headers({ kid: 'unknown-kid' });
    const result = verifyZtRequest({ ...base, headers });
    expect(result).toMatchObject({ ok: false, reason: 'Unknown key id' });
  });

  it('rejects an unsupported algorithm', () => {
    const headers = buildV2Headers();
    headers['x-zt-alg'] = 'rsa';
    const result = verifyZtRequest({ ...base, headers });
    expect(result).toMatchObject({
      ok: false,
      reason: 'Unsupported algorithm',
    });
  });
});

describe('verifyZtRequest v1 (HMAC fallback)', () => {
  it('accepts a valid HMAC request when v1 is allowed', () => {
    const headers = buildV1Headers();
    const result = verifyZtRequest({
      ...base,
      method: 'GET',
      headers,
    });
    expect(result.ok).toBe(true);
  });

  it('rejects HMAC requests when v1 is disabled', () => {
    const headers = buildV1Headers();
    const result = verifyZtRequest({
      ...base,
      method: 'GET',
      headers,
      acceptV1Hmac: false,
    });
    expect(result).toMatchObject({
      ok: false,
      reason: 'Legacy HMAC not accepted',
    });
  });
});
