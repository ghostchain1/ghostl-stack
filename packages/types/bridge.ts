export type TransferStatus = 'pending' | 'finalized' | 'failed';

export interface TransferTxRef {
  hash: string;
  chainId: string;
}

export interface Transfer {
  id: string;
  srcChain: string;
  dstChain: string;
  status: TransferStatus;
  amount: string;
  txs: TransferTxRef[];
  createdAt?: string;
}

export interface BridgeControl {
  paused: boolean;
  feeBps?: number;
  emergencyMode?: boolean;
}
