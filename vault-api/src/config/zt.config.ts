import { registerAs } from '@nestjs/config';

function readSecret(envName: string, fallback: string) {
  const value = process.env[envName]?.trim();
  if (value) return value;

  const runtime = process.env.NODE_ENV ?? 'development';
  if (runtime === 'development' || runtime === 'test') {
    return fallback;
  }

  throw new Error(`${envName} must be configured outside development/test`);
}

export default registerAs('zt', () => ({
  hmacSecret: readSecret('ZT_HMAC_SECRET', 'change_me_zt_secret'),
  maxClockSkewMs: Number(process.env.ZT_MAX_CLOCK_SKEW_MS ?? 30000),
  // Ed25519 verification keyring: JSON `{ kid: pemPublicKey }`. Public keys are
  // non-secret and safe to ship via config/compose.
  verifyPublicKeys: process.env.ZT_VERIFY_PUBLIC_KEYS ?? '',
  // Accept the legacy v1 HMAC protocol during migration. Set to "false" to
  // retire HMAC once every signer has switched to Ed25519.
  acceptV1Hmac: (process.env.ZT_ACCEPT_V1_HMAC ?? 'true') !== 'false',
}));
