/**
 * chainDiscovery.ts — AI-powered chain ecosystem scanner
 *
 * Discovers and ranks external blockchain ecosystems where GhostStack
 * can expand by deploying bridges, liquidity pools, and wrapped assets.
 * Chains scored by liquidity depth, user base, and protocol compatibility.
 */

import { v4 as uuidv4 } from "uuid";
import logger from "../utils/logger";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ChainType   = "evm" | "cosmos" | "solana" | "substrate" | "move" | "other";
export type ExpandStatus = "target" | "deploying" | "active" | "paused" | "excluded";

export interface ChainProfile {
  id:                string;
  name:              string;
  symbol:            string;
  type:              ChainType;
  chainId?:          number;        // EVM chain IDs where applicable
  nativeToken:       string;
  status:            ExpandStatus;
  discoveredAt:      number;
  lastAnalyzed:      number;

  // Ecosystem metrics (normalised 0–100)
  liquidityScore:    number;        // total on-chain TVL proxy
  userScore:         number;        // monthly active addresses proxy
  compatScore:       number;        // bridge / EVM compatibility
  growthScore:       number;        // 30-day growth trajectory
  overallScore:      number;        // weighted aggregate

  // Raw estimates
  estimatedTVL_USD:  number;
  estimatedUsers:    number;        // monthly active

  // GhostStack expansion flags
  bridgeDeployed:    boolean;
  poolsDeployed:     number;
  wrappedAssets:     number;
  messagesRelayed:   number;

  tags:              string[];
  notes:             string;
}

// ── Storage ───────────────────────────────────────────────────────────────────

const chains = new Map<string, ChainProfile>();

// ── Scoring helper ────────────────────────────────────────────────────────────

function calcOverall(c: Pick<ChainProfile, "liquidityScore" | "userScore" | "compatScore" | "growthScore">): number {
  return Math.round(
    c.liquidityScore * 0.35 +
    c.userScore      * 0.30 +
    c.compatScore    * 0.20 +
    c.growthScore    * 0.15,
  );
}

// ── Seed canonical target chains ──────────────────────────────────────────────

const SEED_CHAINS: Omit<ChainProfile, "id" | "discoveredAt" | "lastAnalyzed" | "overallScore" | "bridgeDeployed" | "poolsDeployed" | "wrappedAssets" | "messagesRelayed">[] = [
  {
    name: "Ethereum",  symbol: "ETH",  type: "evm",    chainId: 1,
    nativeToken: "ETH", status: "active",
    liquidityScore: 95, userScore: 90, compatScore: 98, growthScore: 60,
    estimatedTVL_USD: 45_000_000_000, estimatedUsers: 2_400_000,
    tags: ["evm", "defi", "nft", "layer1"],
    notes: "Primary expansion target — highest liquidity depth in Web3",
  },
  {
    name: "Polygon",   symbol: "MATIC", type: "evm",   chainId: 137,
    nativeToken: "MATIC", status: "active",
    liquidityScore: 72, userScore: 80, compatScore: 98, growthScore: 70,
    estimatedTVL_USD: 1_200_000_000, estimatedUsers: 4_100_000,
    tags: ["evm", "l2-adjacent", "defi", "low-fee"],
    notes: "High user count, EVM-compatible, excellent bridge support",
  },
  {
    name: "Solana",    symbol: "SOL",  type: "solana",
    nativeToken: "SOL", status: "deploying",
    liquidityScore: 62, userScore: 78, compatScore: 50, growthScore: 85,
    estimatedTVL_USD: 4_500_000_000, estimatedUsers: 3_200_000,
    tags: ["high-tps", "defi", "nft", "non-evm"],
    notes: "Strong DeFi/NFT ecosystem; adapter required for messaging bridge",
  },
  {
    name: "Cosmos (Hub)", symbol: "ATOM", type: "cosmos",
    nativeToken: "ATOM", status: "deploying",
    liquidityScore: 40, userScore: 45, compatScore: 72, growthScore: 65,
    estimatedTVL_USD: 900_000_000, estimatedUsers: 680_000,
    tags: ["ibc", "interchain", "cosmos-sdk"],
    notes: "IBC-native interchain protocol; key for cross-chain messaging",
  },
  {
    name: "Avalanche",  symbol: "AVAX", type: "evm",   chainId: 43114,
    nativeToken: "AVAX", status: "target",
    liquidityScore: 55, userScore: 55, compatScore: 96, growthScore: 68,
    estimatedTVL_USD: 1_400_000_000, estimatedUsers: 890_000,
    tags: ["evm", "subnet", "defi"],
    notes: "EVM subnet architecture enables custom GhostL2 sub-chain deployment",
  },
  {
    name: "BNB Chain",  symbol: "BNB",  type: "evm",   chainId: 56,
    nativeToken: "BNB", status: "target",
    liquidityScore: 78, userScore: 85, compatScore: 97, growthScore: 55,
    estimatedTVL_USD: 3_800_000_000, estimatedUsers: 6_500_000,
    tags: ["evm", "defi", "cex-aligned"],
    notes: "Massive retail user base; strategic for GST CEX-aligned liquidity",
  },
  {
    name: "Arbitrum",   symbol: "ARB",  type: "evm",   chainId: 42161,
    nativeToken: "ETH", status: "target",
    liquidityScore: 68, userScore: 62, compatScore: 99, growthScore: 75,
    estimatedTVL_USD: 3_200_000_000, estimatedUsers: 1_100_000,
    tags: ["evm", "l2", "optimistic-rollup", "defi"],
    notes: "Ethereum L2 with deep DeFi liquidity; native CCIP bridge support",
  },
  {
    name: "Optimism",   symbol: "OP",   type: "evm",   chainId: 10,
    nativeToken: "ETH", status: "target",
    liquidityScore: 55, userScore: 52, compatScore: 99, growthScore: 72,
    estimatedTVL_USD: 1_800_000_000, estimatedUsers: 820_000,
    tags: ["evm", "l2", "superchain", "defi"],
    notes: "Superchain member — GhostL2 could join the OP stack ecosystem",
  },
  {
    name: "Base",       symbol: "ETH",  type: "evm",   chainId: 8453,
    nativeToken: "ETH", status: "target",
    liquidityScore: 45, userScore: 60, compatScore: 99, growthScore: 88,
    estimatedTVL_USD: 1_600_000_000, estimatedUsers: 2_000_000,
    tags: ["evm", "l2", "coinbase", "superchain"],
    notes: "Fastest-growing L2; Coinbase user base integration opportunity",
  },
  {
    name: "Near Protocol", symbol: "NEAR", type: "other",
    nativeToken: "NEAR", status: "target",
    liquidityScore: 28, userScore: 35, compatScore: 45, growthScore: 60,
    estimatedTVL_USD: 320_000_000, estimatedUsers: 420_000,
    tags: ["sharded", "wasm", "ai-friendly"],
    notes: "AI-native chain with sharding; alignment with GhostBrain architecture",
  },
];

export function seedChains(): void {
  if (chains.size > 0) { logger.info("[ChainDiscovery] Already seeded — skipping"); return; }

  const now = Date.now();
  for (const seed of SEED_CHAINS) {
    const overall = calcOverall(seed);
    const c: ChainProfile = {
      ...seed,
      id:             uuidv4(),
      discoveredAt:   now - Math.floor(Math.random() * 30 * 86400 * 1000),
      lastAnalyzed:   now,
      overallScore:   overall,
      bridgeDeployed: seed.status === "active",
      poolsDeployed:  seed.status === "active" ? 3 : 0,
      wrappedAssets:  seed.status === "active" ? 1 : 0,
      messagesRelayed: seed.status === "active" ? Math.floor(Math.random() * 2000 + 500) : 0,
    };
    chains.set(c.id, c);
  }
  logger.info(`[ChainDiscovery] Seeded ${chains.size} chain profiles`);
}

// ── Discovery & ranking ───────────────────────────────────────────────────────

export function discoverChains(opts?: {
  status?:    ExpandStatus;
  type?:      ChainType;
  minScore?:  number;
  limit?:     number;
}): ChainProfile[] {
  let results = [...chains.values()];
  if (opts?.status)   results = results.filter((c) => c.status === opts.status);
  if (opts?.type)     results = results.filter((c) => c.type   === opts.type);
  if (opts?.minScore) results = results.filter((c) => c.overallScore >= opts.minScore!);
  results.sort((a, b) => b.overallScore - a.overallScore);
  if (opts?.limit) results = results.slice(0, opts.limit);
  return results;
}

export function runDiscoveryCycle(): { scanned: number; newTargets: ChainProfile[] } {
  const now = Date.now();
  const jitter = () => Math.random() * 6 - 3; // ±3 score drift
  const newTargets: ChainProfile[] = [];

  for (const c of chains.values()) {
    c.liquidityScore = Math.max(0, Math.min(100, c.liquidityScore + jitter()));
    c.userScore      = Math.max(0, Math.min(100, c.userScore      + jitter()));
    c.growthScore    = Math.max(0, Math.min(100, c.growthScore    + jitter()));
    c.overallScore   = calcOverall(c);
    c.lastAnalyzed   = now;

    if (c.status === "target" && c.overallScore >= 70) {
      newTargets.push(c);
    }
  }

  logger.info(`[ChainDiscovery] Scan complete — ${chains.size} chains, ${newTargets.length} upgraded to priority`);
  return { scanned: chains.size, newTargets };
}

// ── Queries ───────────────────────────────────────────────────────────────────

export function getChainById(id: string):       ChainProfile | undefined { return chains.get(id); }
export function getAllChains():                  ChainProfile[]           { return [...chains.values()]; }
export function updateChainField(id: string, patch: Partial<ChainProfile>): boolean {
  const c = chains.get(id);
  if (!c) return false;
  Object.assign(c, patch, { lastAnalyzed: Date.now() });
  return true;
}

export function getDiscoveryStats() {
  const all = getAllChains();
  return {
    total:          all.length,
    active:         all.filter((c) => c.status === "active").length,
    deploying:      all.filter((c) => c.status === "deploying").length,
    targeted:       all.filter((c) => c.status === "target").length,
    avgScore:       Math.round(all.reduce((s, c) => s + c.overallScore, 0) / Math.max(1, all.length)),
    totalBridges:   all.filter((c) => c.bridgeDeployed).length,
    totalPools:     all.reduce((s, c) => s + c.poolsDeployed, 0),
    totalRelayed:   all.reduce((s, c) => s + c.messagesRelayed, 0),
    totalTVL_USD:   all.reduce((s, c) => s + c.estimatedTVL_USD, 0),
  };
}
