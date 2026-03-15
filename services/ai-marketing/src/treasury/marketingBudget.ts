/**
 * MarketingBudget — reads Ghost Treasury balance and allocates a percentage
 * to the marketing system. Connects to GhostBrain economy engine when available.
 */

import axios from "axios";
import logger from "../utils/logger";

export interface BudgetAllocation {
  totalTreasury:  number; // USD
  marketingPct:   number;
  marketingBudget: number; // USD
  breakdown: {
    socialAds:    number;
    influencers:  number;
    seo:          number;
    community:    number;
    reserve:      number;
  };
  allocatedAt: string;
}

const MARKETING_TREASURY_PCT = 0.05; // 5% of treasury → marketing
let lastAllocation: BudgetAllocation | null = null;

async function fetchTreasuryBalance(): Promise<number> {
  const url = process.env.GHOST_ECONOMY_URL ?? "http://localhost:9980";
  try {
    const { data } = await axios.get(`${url}/treasury/balance`, { timeout: 5_000 });
    return typeof data.balanceUsd === "number" ? data.balanceUsd : 1_000_000;
  } catch {
    logger.warn("MarketingBudget: treasury API unreachable, using default $1M");
    return 1_000_000;
  }
}

export async function allocateMarketingBudget(): Promise<BudgetAllocation> {
  const treasury = await fetchTreasuryBalance();
  const budget   = treasury * MARKETING_TREASURY_PCT;

  const allocation: BudgetAllocation = {
    totalTreasury:   treasury,
    marketingPct:    MARKETING_TREASURY_PCT * 100,
    marketingBudget: budget,
    breakdown: {
      socialAds:   budget * 0.40,
      influencers: budget * 0.25,
      seo:         budget * 0.15,
      community:   budget * 0.15,
      reserve:     budget * 0.05,
    },
    allocatedAt: new Date().toISOString(),
  };

  lastAllocation = allocation;
  logger.info(`MarketingBudget: allocated $${budget.toFixed(2)} from treasury $${treasury.toFixed(2)}`);
  return allocation;
}

export function getLastAllocation(): BudgetAllocation | null {
  return lastAllocation;
}
