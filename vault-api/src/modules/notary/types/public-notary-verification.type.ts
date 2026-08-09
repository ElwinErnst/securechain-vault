export type PublicNotaryVerification = {
  status: 'VALID' | 'MODIFIED';
  notaryStatus: 'PENDING' | 'ISSUED' | 'SIMULATED' | 'FAILED';
  documentId: string;
  provider: string;
  /** Merkle root the document was anchored under. */
  rootHex: string;
  batchId: string | null;
  /** When the anchoring batch was externally timestamped. */
  timestampedAt: Date;
};
