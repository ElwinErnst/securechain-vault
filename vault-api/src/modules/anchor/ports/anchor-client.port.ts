import type { AnchorPayload } from '../types/anchor-payload.type';

export type AnchorResult = {
  /**
   * True when no on-chain transaction was made (dev/simulated backend).
   * A simulated result MUST NOT be presented as blockchain proof.
   */
  simulated: boolean;
  /** On-chain transaction hash, or null when simulated. */
  txHash: string | null;
  chainId: number;
  anchoredAt: Date;
};

export interface AnchorClientPort {
  anchorDocumentHash(opts: AnchorPayload): Promise<AnchorResult>;
}
