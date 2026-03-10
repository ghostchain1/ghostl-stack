// Treasury Investment Advisor — analyses allocation distribution vs targets,
// recommends reallocation proposals for human governance ratification.
// Never executes transactions autonomously.

import { API_BASE, TREASURY_TARGETS } from '../config/sinConfig.js';
import type { TreasuryAllocation, TreasuryAllocationEntry } from '../types.js';

interface TreasuryApiResponse {
  totalGst?:      string;             // wei as string
  allocations?: Array<{
    purpose:    string;
    amountGst?: string;
    pct?:       number;
  }>;
  annualYieldPct?: number;
}

export async function adviseTreasuryAllocation(): Promise<TreasuryAllocation | null> {
  let data: TreasuryApiResponse | null = null;

  try {
    const res = await fetch(`${API_BASE}/api/treasury/summary`, {
      signal: AbortSignal.timeout(6_000),
    });
    if (res.ok) data = (await res.json()) as TreasuryApiResponse;
  } catch {
    return null;
  }

  if (!data) return null;

  const totalGst = data.totalGst ?? '0';
  const totalWei = BigInt(totalGst);
  const currentPcts: Record<string, number> = {};

  for (const alloc of data.allocations ?? []) {
    currentPcts[alloc.purpose] = alloc.pct ?? 0;
  }

  const entries: TreasuryAllocationEntry[] = [];

  for (const [purpose, targetPct] of Object.entries(TREASURY_TARGETS)) {
    const currentPct   = currentPcts[purpose] ?? 0;
    const deltaPct     = targetPct - currentPct;
    const deltaWei     = totalWei > 0n
      ? (totalWei * BigInt(Math.round(Math.abs(deltaPct) * 100))) / 10_000n
      : 0n;
    const signedDelta  = deltaPct >= 0 ? deltaWei : -deltaWei;

    let rationale: string;
    if (Math.abs(deltaPct) < 2) {
      rationale = `${purpose} allocation (${currentPct.toFixed(1)}%) is on target`;
    } else if (deltaPct > 0) {
      rationale = `${purpose} is ${deltaPct.toFixed(1)}pp under target — recommend increasing allocation`;
    } else {
      rationale = `${purpose} is ${Math.abs(deltaPct).toFixed(1)}pp over target — recommend reducing allocation`;
    }

    entries.push({
      purpose,
      currentPct,
      proposedPct: targetPct,
      deltaGst:    signedDelta.toString(),
      rationale,
    });
  }

  return {
    totalTreasuryGst:      totalGst,
    allocations:           entries,
    expectedAnnualYieldPct: data.annualYieldPct ?? 0,
  };
}
