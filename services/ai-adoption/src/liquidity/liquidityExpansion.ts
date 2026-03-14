/**
 * LiquidityExpansion — incentivises liquidity on GhostXchange pools.
 */

import logger from "../utils/logger";

export interface LiquidityPool {
  id:          string;
  pair:        string;
  tvl:         number;  // USD
  apy:         number;  // %
  utilization: number;  // %
  status:      "healthy" | "incentivised" | "critical";
  incentiveUsd: number; // active incentive allocation
}

const POOLS: LiquidityPool[] = [
  { id: "pool-001", pair: "GST/USDC",  tvl: 4_200_000, apy: 18.5, utilization: 72, status: "healthy",      incentiveUsd: 0 },
  { id: "pool-002", pair: "GST/ETH",   tvl: 2_800_000, apy: 22.1, utilization: 58, status: "incentivised", incentiveUsd: 50_000 },
  { id: "pool-003", pair: "GST/GHOST", tvl: 800_000,   apy: 45.0, utilization: 34, status: "critical",     incentiveUsd: 120_000 },
  { id: "pool-004", pair: "GHOST/BTC", tvl: 1_500_000, apy: 14.2, utilization: 80, status: "healthy",      incentiveUsd: 0 },
];

const TVL_CRITICAL = 1_000_000;

export async function growLiquidity(): Promise<{ incentivised: LiquidityPool[] }> {
  logger.info("LiquidityExpansion: scanning pools");

  const lowLiquidity = POOLS.filter(p => p.tvl < TVL_CRITICAL);

  lowLiquidity.forEach(p => {
    const boost = Math.round((TVL_CRITICAL - p.tvl) * 0.05);
    p.incentiveUsd += boost;
    p.status        = "incentivised";
    p.apy          += 10; // temporary APY boost to attract LPs
    logger.info(`LiquidityExpansion: incentivised ${p.pair} pool +$${boost.toLocaleString()}`);
  });

  // Simulate growth tick
  POOLS.forEach(p => {
    p.tvl += Math.random() * 100_000;
    p.apy  = Math.max(5, p.apy + (Math.random() - 0.5));
  });

  return { incentivised: lowLiquidity };
}

export function getPools(): LiquidityPool[] {
  return POOLS;
}
