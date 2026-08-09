import { verifyTimestampToken } from './rfc3161-verify';
import { REAL_TSA_TOKEN } from './__fixtures__/rfc3161-token.fixture';

describe('verifyTimestampToken', () => {
  it('accepts a genuine token that attests the expected root', async () => {
    const result = await verifyTimestampToken(
      REAL_TSA_TOKEN.tokenB64,
      REAL_TSA_TOKEN.rootHex,
    );

    expect(result).toEqual({ valid: true, reason: null });
  });

  it('rejects a token whose imprint does not match the root', async () => {
    const otherRoot = 'f'.repeat(64);
    const result = await verifyTimestampToken(
      REAL_TSA_TOKEN.tokenB64,
      otherRoot,
    );

    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/messageImprint/i);
  });

  it('rejects a token whose signature has been tampered', async () => {
    // Flip a byte deep in the DER (inside the signature/cert area) so the
    // messageImprint still parses but the CMS signature no longer verifies.
    const bytes = Buffer.from(REAL_TSA_TOKEN.tokenB64, 'base64');
    bytes[bytes.length - 10] ^= 0xff;
    const tampered = bytes.toString('base64');

    const result = await verifyTimestampToken(tampered, REAL_TSA_TOKEN.rootHex);

    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/signature/i);
  });

  it('rejects malformed token bytes', async () => {
    const result = await verifyTimestampToken(
      'bm90LWEtdG9rZW4=',
      'a'.repeat(64),
    );

    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/malformed/i);
  });
});
