import { createPublicKey, type KeyObject } from 'crypto';

/** Map of key id -> Ed25519 public key. Public keys are non-secret. */
export type PublicKeyring = Map<string, KeyObject>;

/**
 * Build the verification keyring from `ZT_VERIFY_PUBLIC_KEYS`, a JSON object of
 * `{ kid: pemPublicKey }`. Holding multiple keys at once is what makes key
 * rotation zero-downtime: the new key is added, the signer switches kid, then
 * the old key is retired after the overlap window.
 *
 * Empty/absent config yields an empty keyring (v2 requests will be rejected
 * with "Unknown key id" until keys are provisioned).
 */
export function loadPublicKeyring(raw: string | undefined): PublicKeyring {
  const ring: PublicKeyring = new Map();
  const trimmed = raw?.trim();
  if (!trimmed) return ring;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error('ZT_VERIFY_PUBLIC_KEYS is not valid JSON');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      'ZT_VERIFY_PUBLIC_KEYS must be a JSON object of {kid: pem}',
    );
  }

  for (const [kid, pem] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof pem !== 'string' || pem.trim().length === 0) {
      throw new Error(`ZT_VERIFY_PUBLIC_KEYS[${kid}] must be a PEM string`);
    }
    // createPublicKey throws on malformed PEM — fail fast at boot, not per request.
    ring.set(kid, createPublicKey(pem));
  }

  return ring;
}

export function getVerifyKey(
  ring: PublicKeyring,
  kid: string,
): KeyObject | null {
  return ring.get(kid) ?? null;
}
