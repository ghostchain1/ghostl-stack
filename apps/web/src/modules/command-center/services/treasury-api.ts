/**
 * treasury-api.ts — Client-side helper for the treasury endpoint.
 */

export interface TreasuryStatus {
  balance: string;
  balanceFormatted: string;
  pendingRewards: string;
  totalDistributed: string;
  lastDistributionBlock: number;
  reserveRatio: number;
}

export async function fetchTreasuryStatus(): Promise<TreasuryStatus> {
  const res = await fetch('/api/command-center/treasury', { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<TreasuryStatus>;
}
