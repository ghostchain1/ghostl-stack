export type TxStatus = 'pending' | 'success' | 'failed';

export interface Tx {
  hash: string;
  from: string;
  to?: string;
  value: string;
  gas: number;
  status: TxStatus;
  error?: string;
  nonce?: number;
  blockNumber?: number;
  time?: string;
}

export interface Block {
  number: number;
  hash: string;
  proposer?: string;
  txCount: number;
  size?: number;
  time: string;
}
