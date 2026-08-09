export type PublicNotaryVerification = {
  status: 'VALID' | 'MODIFIED' | 'NOT_ANCHORED';
  notaryStatus: 'PENDING' | 'ISSUED' | 'SIMULATED' | 'FAILED';
  documentId: string;
  provider: string;
  providerRef: string | null;
  chainId: number | null;
  anchorTxHash: string | null;
  anchoredAt: Date | null;
};
