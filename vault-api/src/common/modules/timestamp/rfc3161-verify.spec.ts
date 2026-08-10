import { parsePemCertificates, verifyTimestampToken } from './rfc3161-verify';
import { FREETSA_CA_PEM } from './freetsa-ca';
import { REAL_TSA_TOKEN } from './__fixtures__/rfc3161-token.fixture';

const trustedCerts = parsePemCertificates(FREETSA_CA_PEM);

describe('verifyTimestampToken', () => {
  it('accepts a genuine token that chains to the trusted TSA CA', async () => {
    const result = await verifyTimestampToken(
      REAL_TSA_TOKEN.tokenB64,
      REAL_TSA_TOKEN.rootHex,
      trustedCerts,
    );

    expect(result).toEqual({ valid: true, reason: null });
  });

  it('rejects a token when no trusted CA is configured', async () => {
    const result = await verifyTimestampToken(
      REAL_TSA_TOKEN.tokenB64,
      REAL_TSA_TOKEN.rootHex,
      [],
    );

    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/no trusted/i);
  });

  it('rejects a token whose imprint does not match the root', async () => {
    const result = await verifyTimestampToken(
      REAL_TSA_TOKEN.tokenB64,
      'f'.repeat(64),
      trustedCerts,
    );

    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/messageImprint/i);
  });

  it('rejects a token whose bytes have been tampered', async () => {
    const bytes = Buffer.from(REAL_TSA_TOKEN.tokenB64, 'base64');
    bytes[bytes.length - 10] ^= 0xff;
    const tampered = bytes.toString('base64');

    const result = await verifyTimestampToken(
      tampered,
      REAL_TSA_TOKEN.rootHex,
      trustedCerts,
    );

    expect(result.valid).toBe(false);
    expect(result.reason).not.toBeNull();
  });

  it('rejects malformed token bytes', async () => {
    const result = await verifyTimestampToken(
      'bm90LWEtdG9rZW4=',
      'a'.repeat(64),
      trustedCerts,
    );

    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/malformed/i);
  });
});
