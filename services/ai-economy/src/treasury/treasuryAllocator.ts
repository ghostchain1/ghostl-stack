/**
 * TreasuryAllocator — reads GhostChain treasury balance from the economy endpoint
 * and computes optimal fund allocation across departments.
 */

import axios  from "axios";
import logger from "../utils/logger";

const ECONOMY_URL = process.env.GHOST_ECONOMY_URL ?? "http://localhost:9980";

export interface Allocation {
  department: string;
  pct:        number;
  amount:     number;
  currency:   "USD";
}

export interface TreasuryState {
  totalUSD:    number;
  allocations: Allocation[];
  updatedAt:   string;
}

const RATIOS: Array<{ department: string; pct: number }> = [
  { department: "Development",    pct: 25 },
  { department: "Marketing",      pct: 20 },
  { department: "Liquidity",      pct: 30 },
  { department: "Grants",         pct: 15 },
  { department: "Reserves",       pct: 10 },
];

let state: TreasuryState = {
  totalUSD:    1_000_000,
  allocations: [],
  updatedAt:   new Date().toISOString(),
};

async function fetchTreasuryBalance(): Promise<number> {
  try {
    const { data } = await axios.get(`${ECONOMY_URL}/treasury/balance`, { timeout: 5000 });
    return typeof data?.totalUSD === "number" ? data.totalUSD : 1_000_000;
  } catch {
    logger.warn("TreasuryAllocator: economy endpoint unreachable, using last known balance");
    return state.totalUSD;
  }
}

export async function computeAllocations(): Promise<TreasuryState> {
  const total = await fetchTreasuryBalance();
  const allocations: Allocation[] = RATIOS.map(r => ({
    department: r.department,
    pct:        r.pct,
    amount:     Math.round(total * r.pct / 100),
    currency:   "USD",
  }));

  state = { totalUSD: total, allocations, updatedAt: new Date().toISOString() };
  logger.info(`TreasuryAllocator: treasury $${total.toLocaleString()} allocated across ${allocations.length} departments`);
  return state;
}

export function getTreasuryState(): TreasuryState { return state; }
