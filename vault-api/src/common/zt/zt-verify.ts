import { createHash, createHmac } from 'crypto';
import { canonicalizeZt, canonicalizeZtV2 } from './canonical';
import { verifyEd25519 } from './ed25519';
import { getVerifyKey, type PublicKeyring } from './keyring';

type HeaderValue = string | string[] | undefined;
type HeadersMap = Readonly<Record<string, HeaderValue>>;

export type ZtVerifyResult =
  | {
      ok: true;
      userId: string;
      tenantId: string;
      roles: string[];
      replayKey: string;
      version: '1' | '2';
      keyId?: string;
    }
  | { ok: false; reason: string };

function safeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}

function getHeader(headers: HeadersMap, key: string): string | null {
  const value = headers[key];
  if (typeof value === 'string') return value.length > 0 ? value : null;
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === 'string' && first.length > 0 ? first : null;
  }
  return null;
}

function sha256Hex(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

function ok(
  version: '1' | '2',
  userId: string,
  tenantId: string,
  rolesStr: string,
  nonce: string,
  keyId?: string,
): ZtVerifyResult {
  return {
    ok: true,
    version,
    keyId,
    userId,
    tenantId,
    roles: rolesStr
      .split(',')
      .map((role) => role.trim())
      .filter(Boolean),
    replayKey: `${userId}:${nonce}`,
  };
}

type CommonClaims = {
  userId: string;
  tenantId: string;
  rolesStr: string;
  tsMs: number;
  nonce: string;
  bodySha: string;
  sig: string;
};

/** Parse and validate the claims shared by every protocol version. */
function parseCommon(
  headers: HeadersMap,
  maxSkewMs: number,
): CommonClaims | { reason: string } {
  const userId = getHeader(headers, 'x-zt-user-id');
  const tenantId = getHeader(headers, 'x-zt-tenant-id');
  const rolesStr = getHeader(headers, 'x-zt-roles');
  const tsStr = getHeader(headers, 'x-zt-ts');
  const nonce = getHeader(headers, 'x-zt-nonce');
  const bodySha = getHeader(headers, 'x-zt-body-sha256');
  const sig = getHeader(headers, 'x-zt-sig');

  if (
    !userId ||
    !tenantId ||
    !rolesStr ||
    !tsStr ||
    !nonce ||
    !bodySha ||
    !sig
  ) {
    return { reason: 'Missing headers' };
  }

  const tsMs = Number(tsStr);
  if (!Number.isFinite(tsMs)) return { reason: 'Invalid timestamp' };
  if (Math.abs(Date.now() - tsMs) > maxSkewMs) {
    return { reason: 'Timestamp outside allowed window' };
  }

  return { userId, tenantId, rolesStr, tsMs, nonce, bodySha, sig };
}

/**
 * Verify inbound ZT headers. Dispatches on `x-zt-v`:
 *  - v2 → Ed25519 asymmetric signature (keyring lookup by `x-zt-kid`)
 *  - v1 → legacy HMAC-SHA256 (shared secret), only when `acceptV1Hmac` is true
 *
 * When `body` is provided (raw request bytes), the actual body hash is
 * recomputed and compared against the signed `x-zt-body-sha256` — closing the
 * gap where a signed-but-unverified body could be tampered in transit. Body is
 * optional because some routes (multipart uploads) are streamed and cannot
 * expose raw bytes here; those keep the prior behavior.
 *
 * Replay persistence is the caller's responsibility (async I/O): the signature
 * is verified here, and the caller atomically records `replayKey`.
 */
export function verifyZtRequest(input: {
  method: string;
  path: string;
  query: string;
  headers: HeadersMap;
  maxSkewMs: number;
  hmacSecret?: string;
  keyring?: PublicKeyring;
  acceptV1Hmac: boolean;
  body?: Buffer;
}): ZtVerifyResult {
  const { method, path, query, headers, maxSkewMs, body } = input;

  const version = getHeader(headers, 'x-zt-v');
  if (version !== '1' && version !== '2') {
    return { ok: false, reason: 'Invalid version' };
  }

  const common = parseCommon(headers, maxSkewMs);
  if ('reason' in common) return { ok: false, reason: common.reason };

  // Bind the actual body to the signed hash when raw bytes are available.
  if (
    body !== undefined &&
    sha256Hex(body) !== common.bodySha.trim().toLowerCase()
  ) {
    return { ok: false, reason: 'Body hash mismatch' };
  }

  if (version === '2') {
    const alg = getHeader(headers, 'x-zt-alg');
    const kid = getHeader(headers, 'x-zt-kid');
    if (!alg || !kid) return { ok: false, reason: 'Missing headers' };
    if (alg.trim().toLowerCase() !== 'ed25519') {
      return { ok: false, reason: 'Unsupported algorithm' };
    }

    const key = input.keyring ? getVerifyKey(input.keyring, kid) : null;
    if (!key) return { ok: false, reason: 'Unknown key id' };

    const canonical = canonicalizeZtV2({
      alg,
      kid,
      method,
      path,
      query,
      bodySha256Hex: common.bodySha,
      userId: common.userId,
      tenantId: common.tenantId,
      roles: common.rolesStr,
      tsMs: common.tsMs,
      nonce: common.nonce,
    });

    if (!verifyEd25519(key, canonical, common.sig)) {
      return { ok: false, reason: 'Invalid signature' };
    }

    return ok(
      '2',
      common.userId,
      common.tenantId,
      common.rolesStr,
      common.nonce,
      kid,
    );
  }

  // version === '1' (legacy HMAC)
  if (!input.acceptV1Hmac) {
    return { ok: false, reason: 'Legacy HMAC not accepted' };
  }
  if (!input.hmacSecret) {
    return { ok: false, reason: 'Legacy HMAC not accepted' };
  }

  const canonical = canonicalizeZt({
    method,
    path,
    query,
    bodySha256Hex: common.bodySha,
    userId: common.userId,
    tenantId: common.tenantId,
    roles: common.rolesStr,
    tsMs: common.tsMs,
    nonce: common.nonce,
  });
  const expected = createHmac('sha256', input.hmacSecret)
    .update(canonical)
    .digest('hex');
  if (!safeEq(expected, common.sig)) {
    return { ok: false, reason: 'Invalid signature' };
  }

  return ok('1', common.userId, common.tenantId, common.rolesStr, common.nonce);
}
