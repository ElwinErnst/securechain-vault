export type PublicVerifyResult = {
  /** NOT_ANCHORED is never returned publicly (it throws) — only these two. */
  status: 'VALID' | 'MODIFIED';
  documentId: string;
  /** Merkle root the document was anchored under. */
  rootHex: string;
  batchId: string | null;
  /** When the anchoring batch was externally timestamped. */
  timestampedAt: Date;
};
