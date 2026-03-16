import type { Block, Tx } from '@ghostchain/types/explorer';

export interface MempoolService {
  stream(onTx: (tx: Tx) => void): () => void;
}

export interface TxIndexService {
  search(filters: { from?: string; to?: string; status?: Tx['status']; q?: string }): Promise<Tx[]>;
  get(hash: string): Promise<Tx | null>;
}

export interface BlockIndexService {
  list(limit?: number): Promise<Block[]>;
  get(hashOrNumber: string | number): Promise<Block | null>;
}

export interface EntityTaggingService {
  list(address: string): Promise<{ label: string; type: 'wallet' | 'contract' | 'org' }[]>;
  add(address: string, tag: { label: string; type: 'wallet' | 'contract' | 'org' }): Promise<void>;
}
