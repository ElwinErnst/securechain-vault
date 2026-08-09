export type TokenVerification = {
  valid: boolean;
  /** Why the token failed, or null when valid. */
  reason: string | null;
};

/**
 * Verifies that a stored RFC 3161 timestamp token genuinely attests a Merkle
 * root: the token's messageImprint must equal the root and its CMS signature
 * must verify against the embedded TSA certificate.
 */
export interface TimestampVerifierPort {
  verifyToken(tokenB64: string, rootHex: string): Promise<TokenVerification>;
}

/** DI token for the concrete TimestampVerifierPort implementation. */
export const TIMESTAMP_VERIFIER = Symbol('TIMESTAMP_VERIFIER');
