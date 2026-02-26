export type AnchorResult = {
  txHash: string;
  chainId: number;
  anchoredAt: Date;
};

export interface AnchorClientPort {
  anchorDocumentHash(opts: {
    tenantId: string;
    vaultId: string;
    documentId: string;
    sha256Hex: string;
  }): Promise<AnchorResult>;
}
