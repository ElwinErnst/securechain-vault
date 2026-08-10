/**
 * Port for obtaining an external timestamp over a Merkle root. The batching and
 * proof logic lives in AnchorService; a concrete client only turns a root into
 * an external attestation (e.g. an RFC 3161 token from a Timestamp Authority).
 */
export type TimestampResult = {
  /** True when no real external timestamp was obtained (dev/simulated). */
  simulated: boolean;
  /** RFC 3161 timestamp token (base64 DER), or null when simulated. */
  tokenB64: string | null;
  tsaUrl: string | null;
  /** Serial number reported by the TSA, or null when simulated. */
  serial: string | null;
  timestampedAt: Date;
};

export interface TimestampClientPort {
  /** Obtain an external timestamp over a Merkle root (lowercase hex). */
  timestampRoot(rootHex: string): Promise<TimestampResult>;
}

/** DI token for the concrete TimestampClientPort implementation. */
export const TIMESTAMP_CLIENT = Symbol('TIMESTAMP_CLIENT');
