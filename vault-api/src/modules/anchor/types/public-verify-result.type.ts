export type PublicVerifyResult = {
  status: 'VALID' | 'MODIFIED' | 'NOT_ANCHORED';
  documentId: string;
  anchorTxHash: string | null;
  anchoredAt: Date | null;
};
