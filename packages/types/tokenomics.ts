export interface SupplySnapshot {
  total: string;
  circulating: string;
  burned: string;
  minted: string;
  time: string;
}

export interface TreasuryTx {
  id: string;
  to: string;
  amount: string;
  purpose: string;
  approvals: string[];
  createdAt?: string;
}
