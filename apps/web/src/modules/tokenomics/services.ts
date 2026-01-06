import type { SupplySnapshot, TreasuryTx } from '@ghostchain/types/tokenomics';

export interface SupplyService {
  list(): Promise<SupplySnapshot[]>;
}

export interface FeeModelService {
  get(): Promise<{ baseFee?: string; targetGas?: string; mode?: string }>;
  update(model: { baseFee?: string; targetGas?: string; mode?: string }): Promise<void>;
}

export interface TreasuryService {
  getBalance(): Promise<{ chain?: string; native?: string; token?: string }>;
  listTxs(): Promise<TreasuryTx[]>;
}

export interface PayoutService {
  list(): Promise<TreasuryTx[]>;
  create(tx: Omit<TreasuryTx, 'id' | 'approvals'>): Promise<TreasuryTx>;
}
