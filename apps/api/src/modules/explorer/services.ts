import type { Block, Tx } from '../../../../../packages/types';

export interface MempoolService {
  stream(onTx: (tx: Tx) => void): () => void;
  getPending(limit?: number): Promise<Tx[]>;
}

export interface TxIndexService {
  search(filters: Partial<Tx>): Promise<Tx[]>;
  get(hash: string): Promise<Tx | null>;
}

export interface BlockIndexService {
  list(limit?: number): Promise<Block[]>;
  get(number: number): Promise<Block | null>;
}

export interface EntityTaggingService {
  tag(address: string, label: string): Promise<void>;
  getTags(address: string): Promise<string[]>;
}
