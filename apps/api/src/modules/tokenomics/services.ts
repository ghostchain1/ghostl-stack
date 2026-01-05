import type { SupplySnapshot, TreasuryTx } from '../../../../../packages/types';

export interface SupplyService {
  getLatest(): Promise<SupplySnapshot>;
  getHistory(): Promise<SupplySnapshot[]>;
}

export interface FeeModelService {
  getSettings(): Promise<Record<string, unknown>>;
  updateSettings(input: Record<string, unknown>): Promise<void>;
}

export interface TreasuryService {
  list(): Promise<TreasuryTx[]>;
  get(id: string): Promise<TreasuryTx | null>;
}

export interface PayoutService {
  schedule(tx: Omit<TreasuryTx, 'id' | 'approvals'>): Promise<TreasuryTx>;
  approve(id: string, approver: string): Promise<TreasuryTx>;
  execute(id: string): Promise<void>;
}
