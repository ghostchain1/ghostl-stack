/**
 * Liquidity Analyzer
 *
 * Evaluates liquidity pools across GhostChain and external chains to identify
 * rebalancing and arbitrage opportunities.
 *
 * In the MVP, pool data is supplied by the operator via the POOL_CONFIG_JSON
 * environment variable (a JSON array of PoolConfig objects). In future
 * iterations, this data will be read directly from GhostXchange and external
 * DEX contracts.
 */
import type { PoolInfo, MarketInfo, MultichainState } from "../types.js";
import { LIQUIDITY_POLICY }                           from "../policies/liquidity-policy.js";

interface PoolConfig {
  id:            string;
  internalChain: "L1" | "L2" | "L3";
  externalChain: "ghostbridge" | "polygon" | "arbitrum" | "solana" | "cosmos";
  token0:        string;
  token1:        string;
  aprInternal:   number;
  aprExternal:   number;
  tvlGst:        string;
}

/** Load pool configs supplied by the operator. */
function loadPoolConfigs(): PoolConfig[] {
  const raw = process.env["POOL_CONFIG_JSON"];
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as PoolConfig[];
  } catch {
    console.warn("[liquidity-analyzer] POOL_CONFIG_JSON is not valid JSON — skipping pools");
    return [];
  }
}

/** Determine if a pool needs rebalancing based on APR differential. */
function needsRebalance(pool: PoolConfig): boolean {
  return (pool.aprExternal - pool.aprInternal) > LIQUIDITY_POLICY.MIN_APR_DIFF_PCT;
}

/** Build PoolInfo array from operator config. */
export function analyzePools(_state: MultichainState): PoolInfo[] {
  const configs = loadPoolConfigs();
  return configs.map(cfg => ({
    id:              cfg.id,
    internalChain:   cfg.internalChain,
    externalChain:   cfg.externalChain,
    token0:          cfg.token0,
    token1:          cfg.token1,
    aprInternal:     cfg.aprInternal,
    aprExternal:     cfg.aprExternal,
    tvlGst:          cfg.tvlGst,
    rebalanceNeeded: needsRebalance(cfg),
  }));
}

/**
 * Build MarketInfo entries from chain snapshots.
 * In the MVP, market price data comes from operator-configured MARKET_DATA_JSON.
 * In production, prices are read from GhostXchange contracts via GhostBrain oracle.
 */
export function analyzeMarkets(_state: MultichainState): MarketInfo[] {
  const raw = process.env["MARKET_DATA_JSON"];
  if (!raw) return [];

  interface MarketConfig {
    symbol:        string;
    internalChain: "L1" | "L2" | "L3";
    externalChain: "ghostbridge" | "polygon" | "arbitrum" | "solana" | "cosmos";
    internalPrice: number;
    externalPrice: number;
    source:        string;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as MarketConfig[]).map(m => ({
      symbol:        m.symbol,
      internalChain: m.internalChain,
      externalChain: m.externalChain,
      internalPrice: m.internalPrice,
      externalPrice: m.externalPrice,
      spreadPct:     m.internalPrice > 0
        ? Math.abs(m.externalPrice - m.internalPrice) / m.internalPrice * 100
        : 0,
      source:    m.source,
      timestamp: Date.now(),
    }));
  } catch {
    console.warn("[liquidity-analyzer] MARKET_DATA_JSON is not valid JSON — skipping markets");
    return [];
  }
}
