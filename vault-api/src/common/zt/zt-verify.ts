import { createHmac } from 'crypto';
import { canonicalizeZt } from './canonical';

type HeaderValue = string | string[] | undefined;
type HeadersMap = Readonly<Record<string, HeaderValue>>;

export type ZtVerifyResult =
  | { ok: true; userId: string; tenantId: string; roles: string[] }
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

export function verifyZtRequest(input: {
  secret: string;
  method: string;
  path: string;
  query: string;
  headers: HeadersMap;
  maxSkewMs: number;
  replayCache: Map<string, number>;
}): ZtVerifyResult {
  const { secret, method, path, query, headers, maxSkewMs, replayCache } =
    input;

  const version = getHeader(headers, 'x-zt-v');
  if (version !== '1') return { ok: false, reason: 'Invalid version' };

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
    return { ok: false, reason: 'Missing headers' };
  }

  const ts = Number(tsStr);
  if (!Number.isFinite(ts)) return { ok: false, reason: 'Invalid timestamp' };

  const now = Date.now();
  if (Math.abs(now - ts) > maxSkewMs) {
    return { ok: false, reason: 'Timestamp outside allowed window' };
  }

  const replayKey = `${userId}:${nonce}`;
  if (replayCache.has(replayKey)) {
    return { ok: false, reason: 'Replay detected' };
  }

  const canonical = canonicalizeZt({
    method,
    path,
    query,
    bodySha256Hex: bodySha,
    userId,
    tenantId,
    roles: rolesStr,
    tsMs: ts,
    nonce,
  });

  const expected = createHmac('sha256', secret)
    .update(canonical)
    .digest('hex');

  if (!safeEq(expected, sig)) {
    return { ok: false, reason: 'Invalid signature' };
  }

  replayCache.set(replayKey, now);

  return {
    ok: true,
    userId,
    tenantId,
    roles: rolesStr
      .split(',')
      .map((role) => role.trim())
      .filter(Boolean),
  };
}
