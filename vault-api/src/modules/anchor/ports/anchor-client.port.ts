import type { AnchorPayload } from '../types/anchor-payload.type';

export type AnchorResult = {
  txHash: string;
  chainId: number;
  anchoredAt: Date;
};

export interface AnchorClientPort {
  anchorDocumentHash(opts: AnchorPayload): Promise<AnchorResult>;
}
