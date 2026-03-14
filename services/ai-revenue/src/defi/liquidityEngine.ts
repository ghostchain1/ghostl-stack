import { v4 as uuidv4 } from "uuid";

export type PoolState = "active" | "paused" | "rebalancing" | "draining";
export type PoolChain = "ghostl2" | "ghostchain";

export interface LiquidityPool {
  id: string;
  pair: string;
  chain: PoolChain;
  state: PoolState;
  tvlUSD: number;
  apr: number;
  volume24hUSD: number;
  fees24hUSD: number;
  token0: string;
  token1: string;
  token0Reserve: number;
  token1Reserve: number;
  lastRebalance: number;
  rebalanceCount: number;
  createdAt: number;
}

function jitter(base: number, pct = 0.05): number {
  return base * (1 + (Math.random() - 0.5) * pct * 2);
}

function pool(pair: string, chain: PoolChain, state: PoolState,
              tvl: number, apr: number, vol: number,
              t0: string, t1: string, r0: number, r1: number,
              ageDays: number): LiquidityPool {
  return {
    id: uuidv4(), pair, chain, state, tvlUSD: tvl, apr,
    volume24hUSD: vol, fees24hUSD: +(vol * 0.003).toFixed(2),
    token0: t0, token1: t1, token0Reserve: r0, token1Reserve: r1,
    lastRebalance: Date.now() - Math.floor(Math.random() * 7_200_000),
    rebalanceCount: Math.floor(Math.random() * 200) + 10,
    createdAt: Date.now() - 86_400_000 * ageDays,
  };
}

const pools: LiquidityPool[] = [
  pool("GST/USDC",  "ghostl2",    "active",      4_820_000, 18.4, 892_000, "GST",   "USDC",  2_800_000, 2_020_000, 90),
  pool("GST/ETH",   "ghostl2",    "active",      2_340_000, 22.1, 430_000, "GST",   "ETH",   1_500_000,   840_000, 60),
  pool("GST/BTC",   "ghostl2",    "active",      1_890_000, 19.7, 310_000, "GST",   "BTC",   1_100_000,   790_000, 45),
  pool("USDC/ETH",  "ghostl2",    "active",      3_200_000, 12.3, 760_000, "USDC",  "ETH",   1_700_000, 1_500_000, 120),
  pool("GST/GHOST", "ghostl2",    "active",        870_000, 34.5, 180_000, "GST",   "GHOST",   480_000,   390_000, 30),
  pool("GST/USDT",  "ghostchain", "active",      1_540_000, 15.8, 290_000, "GST",   "USDT",    830_000,   710_000, 50),
  pool("ETH/USDC",  "ghostchain", "rebalancing",   980_000, 11.2, 200_000, "ETH",   "USDC",    510_000,   470_000, 40),
  pool("GST/MATIC", "ghostchain", "paused",        320_000,  8.9,  45_000, "GST",   "MATIC",   180_000,   140_000, 20),
];

const actionLog: string[] = [];

export function getPools(opts?: { chain?: PoolChain; state?: PoolState }): LiquidityPool[] {
  return pools.filter((p) =>
    (!opts?.chain || p.chain === opts.chain) &&
    (!opts?.state || p.state === opts.state)
  );
}

export function getPool(id: string): LiquidityPool | undefined {
  return pools.find((p) => p.id === id);
}

export function getPoolStats() {
  const active = pools.filter((p) => p.state === "active");
  return {
    totalPools:      pools.length,
    activePools:     active.length,
    totalTvlUSD:     pools.reduce((s, p) => s + p.tvlUSD, 0),
    totalVolume24hUSD: pools.reduce((s, p) => s + p.volume24hUSD, 0),
    totalFees24hUSD:   pools.reduce((s, p) => s + p.fees24hUSD, 0),
    avgApr:          active.reduce((s, p) => s + p.apr, 0) / (active.length || 1),
    totalRebalances: pools.reduce((s, p) => s + p.rebalanceCount, 0),
  };
}

export async function manageLiquidity(): Promise<{ pool: string; action: string; status: string; tvlUSD: number }> {
  // Rebalance the largest pool that hasn't been rebalanced in > 2h
  const candidate = pools
    .filter((p) => p.state === "active" && Date.now() - p.lastRebalance > 7_200_000)
    .sort((a, b) => b.tvlUSD - a.tvlUSD)[0];

  if (candidate) {
    rebalancePool(candidate.id);
    return { pool: candidate.pair, action: "rebalance", status: "active", tvlUSD: candidate.tvlUSD };
  }
  const largest = pools.filter((p) => p.state === "active").sort((a, b) => b.tvlUSD - a.tvlUSD)[0];
  return { pool: largest?.pair ?? "GST/USDC", action: "monitor", status: "active", tvlUSD: largest?.tvlUSD ?? 0 };
}

export function rebalancePool(id: string): { success: boolean; message: string } {
  const p = pools.find((x) => x.id === id);
  if (!p) return { success: false, message: "Pool not found" };
  if (p.state === "paused") return { success: false, message: "Pool is paused" };
  p.state = "rebalancing";
  p.lastRebalance = Date.now();
  p.rebalanceCount++;
  const msg = `Rebalanced pool ${p.pair} on ${p.chain}`;
  actionLog.push(`[${new Date().toISOString()}] ${msg}`);
  setTimeout(() => { p.state = "active"; }, 15_000);
  return { success: true, message: msg };
}

export function getActionLog(): string[] { return actionLog.slice(-100); }

export function tickLiquidity(): void {
  for (const p of pools) {
    if (p.state !== "active") continue;
    p.tvlUSD       = jitter(p.tvlUSD, 0.003);
    p.volume24hUSD = jitter(p.volume24hUSD, 0.08);
    p.fees24hUSD   = +(p.volume24hUSD * 0.003).toFixed(2);
    p.apr          = jitter(p.apr, 0.02);
  }
}
