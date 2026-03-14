/**
 * liquidityExpansion.ts — Cross-chain liquidity pool manager
 *
 * Deploys and tracks GST liquidity pools across external blockchains.
 * Each pool incentivises deep liquidity via GST rewards, boosting
 * cross-chain token demand and price stability.
 */

import { v4 as uuidv4 } from "uuid";
import logger from "../utils/logger";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PoolProtocol = "uniswap-v3" | "curve" | "balancer" | "orca" | "osmosis" | "pancakeswap" | "ghost-dex";
export type PoolStatus   = "seeding" | "active" | "paused" | "retired";

export interface LiquidityPool {
  id:            string;
  chain:         string;
  protocol:      PoolProtocol;
  pairA:         string;        // e.g. "GST"
  pairB:         string;        // e.g. "ETH"
  label:         string;        // "GST/ETH"
  status:        PoolStatus;
  createdAt:     number;
  updatedAt:     number;

  // Liquidity metrics
  tvl_USD:       number;
  volume24h_USD: number;
  fees24h_USD:   number;
  apy:           number;        // current APY including GST rewards

  // Incentive programme
  gstRewardsPerDay: number;     // GST tokens distributed daily
  rewardEndAt:   number | null;

  // Pool depth
  gstReserve:    number;        // GST tokens in pool
  pairedReserve: number;        // paired token units

  // Addresses (synthetic)
  poolAddress:   string;
  routerAddress: string;

  notes: string;
}

// ── Storage ───────────────────────────────────────────────────────────────────

const pools = new Map<string, LiquidityPool>();

// ── Helpers ───────────────────────────────────────────────────────────────────

function addr(): string {
  return `0x${uuidv4().replace(/-/g, "").slice(0, 40)}`;
}

// ── Seed pools ────────────────────────────────────────────────────────────────

const SEED_POOLS: Omit<LiquidityPool, "id" | "createdAt" | "updatedAt" | "poolAddress" | "routerAddress">[] = [
  {
    chain: "Ethereum",  protocol: "uniswap-v3",
    pairA: "GST", pairB: "ETH",   label: "GST/ETH",  status: "active",
    tvl_USD: 3_200_000, volume24h_USD: 480_000, fees24h_USD: 1_440, apy: 24.5,
    gstRewardsPerDay: 5_000, rewardEndAt: null,
    gstReserve: 42_000_000, pairedReserve: 1_280,
    notes: "Core ETH pool — anchor pair for wGST price discovery",
  },
  {
    chain: "Ethereum",  protocol: "uniswap-v3",
    pairA: "GST", pairB: "USDC",  label: "GST/USDC", status: "active",
    tvl_USD: 2_100_000, volume24h_USD: 320_000, fees24h_USD: 960, apy: 18.2,
    gstRewardsPerDay: 3_500, rewardEndAt: null,
    gstReserve: 28_000_000, pairedReserve: 1_050_000,
    notes: "Stable pair drives low-slippage GST↔USD conversion",
  },
  {
    chain: "Polygon",   protocol: "uniswap-v3",
    pairA: "GST", pairB: "MATIC", label: "GST/MATIC", status: "active",
    tvl_USD: 820_000, volume24h_USD: 145_000, fees24h_USD: 290, apy: 31.8,
    gstRewardsPerDay: 8_000, rewardEndAt: null,
    gstReserve: 12_000_000, pairedReserve: 1_820_000,
    notes: "High-APY Polygon pool attracts retail yield farmers",
  },
  {
    chain: "Polygon",   protocol: "uniswap-v3",
    pairA: "GST", pairB: "USDC",  label: "GST/USDC", status: "active",
    tvl_USD: 640_000, volume24h_USD: 98_000, fees24h_USD: 196, apy: 22.4,
    gstRewardsPerDay: 4_000, rewardEndAt: null,
    gstReserve: 9_500_000, pairedReserve: 320_000,
    notes: "Stable Polygon pair supporting GST market-making",
  },
  {
    chain: "Cosmos (Hub)", protocol: "osmosis",
    pairA: "GST", pairB: "ATOM",  label: "GST/ATOM", status: "active",
    tvl_USD: 380_000, volume24h_USD: 42_000, fees24h_USD: 84, apy: 28.0,
    gstRewardsPerDay: 6_000, rewardEndAt: null,
    gstReserve: 5_200_000, pairedReserve: 31_000,
    notes: "IBC native pool on Osmosis DEX — Cosmos ecosystem entry point",
  },
  {
    chain: "Solana",    protocol: "orca",
    pairA: "GST", pairB: "SOL",   label: "GST/SOL",  status: "seeding",
    tvl_USD: 0, volume24h_USD: 0, fees24h_USD: 0, apy: 0,
    gstRewardsPerDay: 10_000, rewardEndAt: null,
    gstReserve: 0, pairedReserve: 0,
    notes: "Launching alongside Solana bridge — initial seed $200K",
  },
  {
    chain: "BNB Chain", protocol: "pancakeswap",
    pairA: "GST", pairB: "BNB",   label: "GST/BNB",  status: "seeding",
    tvl_USD: 0, volume24h_USD: 0, fees24h_USD: 0, apy: 0,
    gstRewardsPerDay: 7_500, rewardEndAt: null,
    gstReserve: 0, pairedReserve: 0,
    notes: "BSC launch pool — targeting BNB Chain retail DeFi users",
  },
];

export function seedPools(): void {
  if (pools.size > 0) { logger.info("[LiquidityExpansion] Already seeded — skipping"); return; }

  const now = Date.now();
  for (const seed of SEED_POOLS) {
    const p: LiquidityPool = {
      ...seed,
      id:           uuidv4(),
      createdAt:    now - Math.floor(Math.random() * 45 * 86400 * 1000),
      updatedAt:    now,
      poolAddress:  addr(),
      routerAddress: addr(),
    };
    pools.set(p.id, p);
  }
  logger.info(`[LiquidityExpansion] Seeded ${pools.size} liquidity pools`);
}

// ── Expand liquidity to a new chain ──────────────────────────────────────────

export function expandLiquidity(chain: string, opts?: {
  pairB?:            string;
  protocol?:         PoolProtocol;
  initialTVL_USD?:   number;
  gstRewardsPerDay?: number;
}): LiquidityPool {
  const pairB       = opts?.pairB            ?? "USDC";
  const label       = `GST/${pairB}`;
  const protocol    = opts?.protocol         ?? "uniswap-v3";

  // Idempotent
  const existing = [...pools.values()].find((p) => p.chain === chain && p.label === label);
  if (existing) {
    logger.info(`[LiquidityExpansion] Pool "${label}" on ${chain} already exists`);
    return existing;
  }

  const now   = Date.now();
  const tvl   = opts?.initialTVL_USD   ?? 200_000;
  const rwds  = opts?.gstRewardsPerDay ?? 5_000;
  const pool: LiquidityPool = {
    id:            uuidv4(),
    chain,
    protocol,
    pairA:         "GST",
    pairB,
    label,
    status:        "seeding",
    createdAt:     now,
    updatedAt:     now,
    tvl_USD:       tvl,
    volume24h_USD: 0,
    fees24h_USD:   0,
    apy:           0,
    gstRewardsPerDay: rwds,
    rewardEndAt:   null,
    gstReserve:    0,
    pairedReserve: 0,
    poolAddress:   addr(),
    routerAddress: addr(),
    notes:         `Auto-deployed by GIE-X on ${new Date(now).toISOString()}`,
  };

  pools.set(pool.id, pool);
  logger.info(`[LiquidityExpansion] Seeding ${label} pool on ${chain} (initial TVL $${tvl.toLocaleString()})`);
  return pool;
}

// ── Simulate TVL / volume tick ────────────────────────────────────────────────

export function tickPoolMetrics(): void {
  for (const p of pools.values()) {
    if (p.status !== "active") {
      if (p.status === "seeding" && Math.random() < 0.05) p.status = "active";
      continue;
    }
    const drift = 0.97 + Math.random() * 0.06; // ±3%
    p.tvl_USD       = Math.round(p.tvl_USD * drift);
    p.volume24h_USD = Math.round(p.volume24h_USD * (0.8 + Math.random() * 0.4));
    p.fees24h_USD   = Math.round(p.volume24h_USD * 0.003);
    p.apy           = parseFloat(((p.fees24h_USD * 365 / Math.max(p.tvl_USD, 1)) * 100 + (p.gstRewardsPerDay * 365 * 0.01 / Math.max(p.tvl_USD, 1)) * 100).toFixed(1));
    p.updatedAt     = Date.now();
  }
}

// ── Queries ──────────────────────────────────────────────────────────────────

export function getPoolById(id: string): LiquidityPool | undefined  { return pools.get(id); }
export function getPools(chain?: string): LiquidityPool[]           { return chain ? [...pools.values()].filter((p) => p.chain === chain) : [...pools.values()]; }

export function getPoolStats() {
  const all = getPools();
  const active = all.filter((p) => p.status === "active");
  return {
    total:            all.length,
    active:           active.length,
    seeding:          all.filter((p) => p.status === "seeding").length,
    totalTVL_USD:     all.reduce((s, p) => s + p.tvl_USD, 0),
    totalVolume24h:   active.reduce((s, p) => s + p.volume24h_USD, 0),
    totalFees24h:     active.reduce((s, p) => s + p.fees24h_USD, 0),
    gstRewardsPerDay: all.reduce((s, p) => s + p.gstRewardsPerDay, 0),
    avgAPY:           active.length > 0
      ? parseFloat((active.reduce((s, p) => s + p.apy, 0) / active.length).toFixed(1))
      : 0,
    chains:           [...new Set(all.map((p) => p.chain))].length,
  };
}
