/**
 * @file GhostTransaction.ts
 * @description GhostChain canonical transaction type.
 * Replaces ethers.TransactionRequest / TransactionResponse.
 *
 * GhostChain L1 chain ID:  14000101
 * GhostChain L2 chain ID:  14000102
 * GhostChain L3 chain ID:  14000103
 */

export const GHOST_CHAIN_IDS = {
  L1: 14000101,
  L2: 14000102,
  L3: 14000103,
} as const;

export interface GhostTransactionRequest {
  to: string;
  value?: bigint;
  data?: string;
  gasLimit?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  nonce?: number;
  chainId?: number;
}

export interface GhostTransactionResponse {
  hash: string;
  from: string;
  to: string | null;
  value: bigint;
  gasUsed: bigint;
  blockNumber: number | null;
  confirms: number;
  timestamp: number | null;
}

export class GhostTransaction {
  static buildRequest(params: GhostTransactionRequest): GhostTransactionRequest {
    return {
      chainId: GHOST_CHAIN_IDS.L1,
      ...params,
    };
  }

  static parseHash(hash: string): string {
    if (!hash.startsWith("0x") || hash.length !== 66) {
      throw new Error(`Invalid GhostChain tx hash: ${hash}`);
    }
    return hash;
  }
}
