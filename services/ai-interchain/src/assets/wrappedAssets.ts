/**
 * wrappedAssets.ts — Interlayer wrapped GST token manager
 *
 * Tracks wGST deployments across approved Ghost settlement zones. Each wrapped token
 * is fully backed 1:1 by GST locked in the GhostChain bridge contract.
 */

import { v4 as uuidv4 } from "uuid";
import logger from "../utils/logger";

// ── Types ─────────────────────────────────────────────────────────────────────

export type WrappedStatus = "pending" | "active" | "paused" | "migrating" | "deprecated";
export type WrappedStandard = "GRC-20" | "SPL" | "CW-20" | "BEP-20" | "native";

export interface WrappedAsset {
  id:              string;
  token:           string;        // "wGST"
  network:         string;        // Destination chain
  standard:        WrappedStandard;
  status:          WrappedStatus;
  backing:         string;        // "GST on GhostChain"
  deployedAt:      number;
  updatedAt:       number;

  // Contract
  contractAddress: string;
  decimals:        number;

  // Supply & demand
  totalMinted:     number;        // wGST minted lifetime
  burned:          number;        // wGST redeemed lifetime
  circulatingSupply: number;      // = totalMinted - burned
  holdersCount:    number;

  // Market data
  price_USD:       number;        // should track GST price
  marketCap_USD:   number;
  volume24h_USD:   number;

  // Peg health
  pegDeviation_pct: number;       // % deviation from GST price (should be ~0)
  lastRebaseAt:    number | null;

  notes: string;
}

// ── Storage ───────────────────────────────────────────────────────────────────

const assets = new Map<string, WrappedAsset>();

// ── Helpers ──────────────────────────────────────────────────────────────────

function addr(): string {
  return `0x${uuidv4().replace(/-/g, "").slice(0, 40)}`;
}

// ── Seed wGST deployments ────────────────────────────────────────────────────

const SEED_ASSETS: Omit<WrappedAsset, "id" | "deployedAt" | "updatedAt" | "contractAddress">[] = [
  {
    token: "wGST", network: "GhostL2",      standard: "GRC-20", status: "active",
    backing: "GST on GhostChain",           decimals: 18,
    totalMinted: 42_000_000, burned: 3_200_000, circulatingSupply: 38_800_000,
    holdersCount: 4_820,
    price_USD: 0.0245, marketCap_USD: 950_600, volume24h_USD: 182_000,
    pegDeviation_pct: 0.12, lastRebaseAt: Date.now() - 86400 * 1000,
    notes: "Largest wGST deployment — anchors GhostL2 liquidity settlement",
  },
  {
    token: "wGST", network: "GhostL3",      standard: "GRC-20", status: "active",
    backing: "GST on GhostChain",           decimals: 18,
    totalMinted: 18_500_000, burned: 1_400_000, circulatingSupply: 17_100_000,
    holdersCount: 11_340,
    price_USD: 0.0244, marketCap_USD: 417_240, volume24h_USD: 68_000,
    pegDeviation_pct: 0.08, lastRebaseAt: Date.now() - 3600 * 1000,
    notes: "GhostL3 retail activity drives high holder diversity for wGST",
  },
  {
    token: "wGST", network: "GhostHub",     standard: "CW-20", status: "active",
    backing: "GST on GhostChain",           decimals: 6,
    totalMinted: 5_200_000, burned: 640_000, circulatingSupply: 4_560_000,
    holdersCount: 1_820,
    price_USD: 0.0246, marketCap_USD: 112_176, volume24h_USD: 21_000,
    pegDeviation_pct: 0.20, lastRebaseAt: Date.now() - 12 * 3600 * 1000,
    notes: "CW-20 wrapper enabling GhostHub operator settlement",
  },
  {
    token: "wGST", network: "GhostRelay",  standard: "SPL",     status: "pending",
    backing: "GST on GhostChain",           decimals: 9,
    totalMinted: 0, burned: 0, circulatingSupply: 0,
    holdersCount: 0,
    price_USD: 0, marketCap_USD: 0, volume24h_USD: 0,
    pegDeviation_pct: 0, lastRebaseAt: null,
    notes: "SPL-form asset pending GhostRelay activation",
  },
  {
    token: "wGST", network: "GhostOrbit",  standard: "BEP-20",  status: "pending",
    backing: "GST on GhostChain",           decimals: 18,
    totalMinted: 0, burned: 0, circulatingSupply: 0,
    holdersCount: 0,
    price_USD: 0, marketCap_USD: 0, volume24h_USD: 0,
    pegDeviation_pct: 0, lastRebaseAt: null,
    notes: "Orbit-zone asset deployed in staging — pending production release",
  },
];

export function seedWrappedAssets(): void {
  if (assets.size > 0) { logger.info("[WrappedAssets] Already seeded — skipping"); return; }

  const now = Date.now();
  for (const seed of SEED_ASSETS) {
    const a: WrappedAsset = {
      ...seed,
      id:              uuidv4(),
      deployedAt:      now - Math.floor(Math.random() * 60 * 86400 * 1000),
      updatedAt:       now,
      contractAddress: addr(),
    };
    assets.set(a.id, a);
  }
  logger.info(`[WrappedAssets] Seeded ${assets.size} wrapped asset deployments`);
}

// ── Create new wrapped token deployment ───────────────────────────────────────

export function createWrappedToken(chain: string, opts?: {
  standard?: WrappedStandard;
  decimals?: number;
}): WrappedAsset {
  const existing = [...assets.values()].find((a) => a.network === chain);
  if (existing) {
    logger.info(`[WrappedAssets] wGST on ${chain} already exists (${existing.status})`);
    return existing;
  }

  const now = Date.now();
  const asset: WrappedAsset = {
    id:              uuidv4(),
    token:           "wGST",
    network:         chain,
    standard:        opts?.standard ?? "GRC-20",
    status:          "pending",
    backing:         "GST on GhostChain",
    deployedAt:      now,
    updatedAt:       now,
    contractAddress: addr(),
    decimals:        opts?.decimals ?? 18,
    totalMinted:     0,
    burned:          0,
    circulatingSupply: 0,
    holdersCount:    0,
    price_USD:       0,
    marketCap_USD:   0,
    volume24h_USD:   0,
    pegDeviation_pct: 0,
    lastRebaseAt:    null,
    notes:           `Auto-deployed by GIE-X asset engine on ${new Date(now).toISOString()}`,
  };

  assets.set(asset.id, asset);
  logger.info(`[WrappedAssets] Created wGST on ${chain} (${asset.standard})`);
  return asset;
}

// ── Simulate peg drift ────────────────────────────────────────────────────────

export function tickAssetMetrics(gstPrice_USD = 0.0245): void {
  for (const a of assets.values()) {
    if (a.status !== "active") continue;
    const priceDrift = gstPrice_USD * (1 + (Math.random() * 0.006 - 0.003));
    a.price_USD       = parseFloat(priceDrift.toFixed(6));
    a.pegDeviation_pct = parseFloat((Math.abs(priceDrift - gstPrice_USD) / gstPrice_USD * 100).toFixed(2));
    a.marketCap_USD   = Math.round(a.circulatingSupply * a.price_USD);
    a.volume24h_USD   = Math.round(a.volume24h_USD * (0.85 + Math.random() * 0.3));
    a.updatedAt       = Date.now();

    if (a.pegDeviation_pct > 1.0) {
      a.lastRebaseAt  = Date.now();
      a.pegDeviation_pct = parseFloat((Math.random() * 0.2).toFixed(2));
    }
  }
}

// ── Queries ──────────────────────────────────────────────────────────────────

export function getWrappedAssetById(id: string):         WrappedAsset | undefined { return assets.get(id); }
export function getWrappedAssets():                      WrappedAsset[]           { return [...assets.values()]; }
export function getWrappedAssetByChain(chain: string):  WrappedAsset | undefined { return [...assets.values()].find((a) => a.network === chain); }

export function getWrappedStats() {
  const all = getWrappedAssets();
  const active = all.filter((a) => a.status === "active");
  return {
    total:                  all.length,
    active:                 active.length,
    pending:                all.filter((a) => a.status === "pending").length,
    totalCirculatingSupply: active.reduce((s, a) => s + a.circulatingSupply, 0),
    totalMarketCap_USD:     active.reduce((s, a) => s + a.marketCap_USD, 0),
    totalVolume24h_USD:     active.reduce((s, a) => s + a.volume24h_USD, 0),
    totalHolders:           active.reduce((s, a) => s + a.holdersCount, 0),
    avgPegDeviation_pct:    active.length > 0
      ? parseFloat((active.reduce((s, a) => s + a.pegDeviation_pct, 0) / active.length).toFixed(3))
      : 0,
  };
}
