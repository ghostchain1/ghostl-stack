/**
 * LiquidityBalancer — monitors pool TVL and auto-triggers incentive campaigns
 * when any pool drops below the minimum threshold.
 */

import logger from "../utils/logger";

export interface LiquidityPool {
  id:       string;
  pair:     string;
  dex:      string;
  chain:    "GhostL1" | "GhostL2";
  tvl:      number; // USD
  apr:      number; // %
  minTVL:   number; // USD — trigger rebalance below this
  status:   "healthy" | "low-tvl" | "incentivised" | "critical";
}

const POOLS: LiquidityPool[] = [
  { id: "lp1", pair: "GST/USDC",  dex: "GhostSwap", chain: "GhostL2", tvl: 1_200_000, apr: 18, minTVL: 500_000,  status: "healthy" },
  { id: "lp2", pair: "GST/ETH",   dex: "GhostSwap", chain: "GhostL2", tvl: 850_000,   apr: 22, minTVL: 400_000,  status: "healthy" },
  { id: "lp3", pair: "GST/GHOST", dex: "GhostSwap", chain: "GhostL1", tvl: 340_000,   apr: 35, minTVL: 200_000,  status: "healthy" },
  { id: "lp4", pair: "GHOST/BTC", dex: "GhostSwap", chain: "GhostL1", tvl: 220_000,   apr: 28, minTVL: 150_000,  status: "healthy" },
  { id: "lp5", pair: "GST/USDT",  dex: "GhostSwap", chain: "GhostL2", tvl: 95_000,    apr: 15, minTVL: 300_000,  status: "low-tvl" },
  { id: "lp6", pair: "GST/BNB",   dex: "GhostSwap", chain: "GhostL2", tvl: 60_000,    apr: 12, minTVL: 200_000,  status: "low-tvl" },
];

export interface RebalanceAction {
  poolId:    string;
  pair:      string;
  action:    "increase-apr" | "add-incentives" | "emergency-seed";
  newAPR?:   number;
  gstReward: number;
  triggeredAt: string;
}

const actions: RebalanceAction[] = [];

export function rebalancePools(): RebalanceAction[] {
  const triggered: RebalanceAction[] = [];

  for (const pool of POOLS) {
    // Simulate TVL drift
    const drift = (Math.random() - 0.45) * pool.tvl * 0.05;
    pool.tvl = Math.max(0, pool.tvl + drift);

    if (pool.tvl < pool.minTVL * 0.5) {
      pool.status = "critical";
      const action: RebalanceAction = {
        poolId: pool.id, pair: pool.pair,
        action: "emergency-seed",
        newAPR: Math.min(80, pool.apr * 2),
        gstReward: 50_000,
        triggeredAt: new Date().toISOString(),
      };
      pool.apr = action.newAPR!;
      pool.status = "incentivised";
      actions.unshift(action);
      triggered.push(action);
      logger.warn(`LiquidityBalancer: CRITICAL ${pool.pair} pool — emergency seed: +50K GST, APR doubled`);
    } else if (pool.tvl < pool.minTVL) {
      pool.status = "low-tvl";
      const action: RebalanceAction = {
        poolId: pool.id, pair: pool.pair,
        action: "increase-apr",
        newAPR: Math.min(60, pool.apr + 5),
        gstReward: 10_000,
        triggeredAt: new Date().toISOString(),
      };
      pool.apr = action.newAPR!;
      pool.status = "incentivised";
      actions.unshift(action);
      triggered.push(action);
      logger.info(`LiquidityBalancer: low TVL on ${pool.pair} — APR boosted to ${action.newAPR}%`);
    } else {
      pool.status = "healthy";
    }
  }

  if (actions.length > 100) actions.splice(100);
  return triggered;
}

export function getPools():   LiquidityPool[]    { return POOLS; }
export function getActions(): RebalanceAction[]  { return actions.slice(0, 20); }

export function getPoolSummary() {
  return {
    total:      POOLS.length,
    healthy:    POOLS.filter(p => p.status === "healthy").length,
    lowTVL:     POOLS.filter(p => p.status === "low-tvl" || p.status === "critical").length,
    totalTVL:   POOLS.reduce((s, p) => s + p.tvl, 0),
    avgAPR:     POOLS.reduce((s, p) => s + p.apr, 0) / POOLS.length,
  };
}
