/**
 * chainDiscovery.ts — AI-powered chain ecosystem scanner
 *
 * Discovers and ranks Ghost-native execution and settlement zones where
 * GhostStack can expand bridges, liquidity pools, and wrapped assets.
 * Zones are scored by liquidity depth, user base, and protocol compatibility.
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
    name: "GhostChain L1", symbol: "GST", type: "evm", chainId: 14000101,
    nativeToken: "GST", status: "active",
    liquidityScore: 95, userScore: 90, compatScore: 98, growthScore: 60,
    estimatedTVL_USD: 45_000_000_000, estimatedUsers: 2_400_000,
    tags: ["ghost", "defi", "nft", "layer1"],
    notes: "Primary settlement layer and highest-liquidity GhostStack zone",
  },
  {
    name: "GhostL2", symbol: "GST", type: "evm", chainId: 901,
    nativeToken: "GST", status: "active",
    liquidityScore: 72, userScore: 80, compatScore: 98, growthScore: 70,
    estimatedTVL_USD: 1_200_000_000, estimatedUsers: 4_100_000,
    tags: ["ghost", "rollup", "defi", "low-fee"],
    notes: "High user count, Ghost-compatible, excellent bridge support",
  },
  {
    name: "GhostL3", symbol: "GST", type: "evm", chainId: 903,
    nativeToken: "GST", status: "active",
    liquidityScore: 62, userScore: 78, compatScore: 92, growthScore: 85,
    estimatedTVL_USD: 4_500_000_000, estimatedUsers: 3_200_000,
    tags: ["ghost", "app-chain", "defi", "creator-economy"],
    notes: "App execution zone with strong DeFi and creator activity",
  },
  {
    name: "GhostHub", symbol: "GHT", type: "cosmos",
    nativeToken: "GST", status: "deploying",
    liquidityScore: 40, userScore: 45, compatScore: 72, growthScore: 65,
    estimatedTVL_USD: 900_000_000, estimatedUsers: 680_000,
    tags: ["ibc", "interchain", "ghost-ops"],
    notes: "IBC-style operator mesh for cross-zone messaging",
  },
  {
    name: "GhostRelay", symbol: "GRY", type: "other",
    nativeToken: "GST", status: "deploying",
    liquidityScore: 55, userScore: 55, compatScore: 96, growthScore: 68,
    estimatedTVL_USD: 1_400_000_000, estimatedUsers: 890_000,
    tags: ["relay", "messaging", "proofs"],
    notes: "Relay network for signed message delivery and proof fanout",
  },
  {
    name: "GhostOrbit", symbol: "GOR", type: "other",
    nativeToken: "GST", status: "target",
    liquidityScore: 78, userScore: 85, compatScore: 97, growthScore: 55,
    estimatedTVL_USD: 3_800_000_000, estimatedUsers: 6_500_000,
    tags: ["orbit", "retail", "liquidity"],
    notes: "Retail-heavy Ghost-operated zone for broad GST access",
  },
  {
    name: "GhostValidatorNet", symbol: "GVN", type: "other",
    nativeToken: "GST", status: "target",
    liquidityScore: 68, userScore: 62, compatScore: 99, growthScore: 75,
    estimatedTVL_USD: 3_200_000_000, estimatedUsers: 1_100_000,
    tags: ["validators", "consensus", "ops"],
    notes: "Validator fleet with deep execution and liquidity observability",
  },
  {
    name: "GhostArchive", symbol: "GAR", type: "other",
    nativeToken: "GST", status: "target",
    liquidityScore: 55, userScore: 52, compatScore: 99, growthScore: 72,
    estimatedTVL_USD: 1_800_000_000, estimatedUsers: 820_000,
    tags: ["archive", "data", "supervisor"],
    notes: "High-retention archive surface for compliance and replay",
  },
  {
    name: "GhostCompute", symbol: "GCU", type: "other",
    nativeToken: "GST", status: "target",
    liquidityScore: 45, userScore: 60, compatScore: 99, growthScore: 88,
    estimatedTVL_USD: 1_600_000_000, estimatedUsers: 2_000_000,
    tags: ["compute", "ai", "ops"],
    notes: "Fastest-growing Ghost compute zone for AI execution capacity",
  },
  {
    name: "GhostUniverse", symbol: "GUV", type: "other",
    nativeToken: "GST", status: "target",
    liquidityScore: 28, userScore: 35, compatScore: 45, growthScore: 60,
    estimatedTVL_USD: 320_000_000, estimatedUsers: 420_000,
    tags: ["universe", "wasm", "ai-friendly"],
    notes: "AI-native zone aligned with GhostBrain experimentation",
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
