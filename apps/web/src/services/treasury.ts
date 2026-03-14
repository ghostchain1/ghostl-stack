/**
 * treasury.ts — Unified treasury service client.
 *
 * Wraps the BFF treasury endpoints so callers never construct raw URLs.
 *
 * TokenID / denomination: GST (never ETH / WETH).
 */

export interface TreasuryBalance {
  totalGst: string;           // raw wei string
  totalGstFormatted: string;  // human-readable (e.g. "1,234,567.8 GST")
  reserveRatioPercent: number;
  lastUpdateBlock: number;
}

export interface TreasuryDistribution {
  epoch: number;
  distributedGst: string;
  recipientCount: number;
  timestamp: string;
}

export interface TreasuryInvestment {
  id: string;
  label: string;
  allocatedGst: string;
  currentValueGst: string;
  returnPercent: number;
  status: 'active' | 'matured' | 'pending';
}

export interface TreasurySnapshot {
  balance: TreasuryBalance;
  pendingDistribution: string;
  totalDistributed: string;
  investments: TreasuryInvestment[];
  stakingYieldPercent: number;
  burnRateGstPerBlock: string;
  circSupply: string;
  totalSupply: string;
}

export interface TreasuryApprovalRequest {
  id: string;
  type: 'transfer' | 'invest' | 'burn' | 'grant';
  amountGst: string;
  requester: string;
  description: string;
  proposedAt: string;
  status: 'pending' | 'approved' | 'rejected';
  requiredRole: 'OPERATOR' | 'ADMIN' | 'OWNER';
}

async function bff<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { cache: 'no-store', ...init });
  if (!res.ok) throw new Error(`Treasury BFF ${path} → HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export async function fetchTreasurySnapshot(): Promise<TreasurySnapshot> {
  return bff<TreasurySnapshot>('/api/command-center/treasury');
}

export async function fetchTreasuryApprovals(): Promise<TreasuryApprovalRequest[]> {
  return bff<TreasuryApprovalRequest[]>('/api/treasury/approvals');
}

export async function approveTreasuryRequest(id: string): Promise<void> {
  await bff<unknown>(`/api/treasury/approvals/${encodeURIComponent(id)}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function rejectTreasuryRequest(id: string, reason: string): Promise<void> {
  await bff<unknown>(`/api/treasury/approvals/${encodeURIComponent(id)}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
}
