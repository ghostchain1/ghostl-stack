/**
 * multichainAnalytics.ts — Cross-chain performance analytics
 *
 * Aggregates GhostStack's multichain footprint data from all GIE-X modules
 * into a unified snapshot. Snapshots are stored as a rolling history for
 * trend analysis and dashboard visualisation.
 */

import logger from "../utils/logger";
import { getDiscoveryStats, getAllChains }           from "../discovery/chainDiscovery";
import { getBridgeStats, getBridges }                from "../bridges/bridgeDeployment";
import { getPoolStats, getPools }                    from "../liquidity/liquidityExpansion";
import { getWrappedStats, getWrappedAssets }         from "../assets/wrappedAssets";
import { getMessagingStats }                         from "../messaging/crossChainMessaging";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MultichainSnapshot {
  timestamp: number;

  discovery: {
    totalChains:    number;
    activeChains:   number;
    deployingChains: number;
    targetChains:   number;
    avgScore:       number;
    totalTVL_USD:   number;  // Combined ecosystem TVL across all chains
  };

  bridges: {
    total:           number;
    active:          number;
    deploying:       number;
    totalVolume_USD: number;
    dailyVolume_USD: number;
    totalTxCount:    number;
    avgSuccessRate:  number;
  };

  liquidity: {
    total:            number;
    active:           number;
    totalTVL_USD:     number;
    totalVolume24h:   number;
    totalFees24h:     number;
    gstRewardsPerDay: number;
    avgAPY:           number;
    chains:           number;
  };

  wrappedAssets: {
    total:                  number;
    active:                 number;
    totalCirculatingSupply: number;
    totalMarketCap_USD:     number;
    totalVolume24h_USD:     number;
    totalHolders:           number;
    avgPegDeviation_pct:    number;
  };

  messaging: {
    total:           number;
    delivered:       number;
    queued:          number;
    failed:          number;
    successRate:     number;
    totalGasPaid_USD: number;
  };

  // Derived KPIs
  gstExternalLiquidity_USD: number;  // pools TVL + wrapped market cap
  multiChainReach:          number;  // distinct chains with any presence
  interchainHealthScore:    number;  // 0–100 composite
}

export interface ChainPerformance {
  chain:         string;
  bridgeVolume_USD: number;
  poolTVL_USD:   number;
  wGSTMarketCap_USD: number;
  messagesRelayed: number;
  overallScore:  number;
  healthStatus:  "excellent" | "good" | "degraded" | "offline";
}

// ── Storage ───────────────────────────────────────────────────────────────────

const snapshots: MultichainSnapshot[] = [];
const MAX_SNAPSHOTS = 288; // 24h at 5-min intervals

// ── Build snapshot ────────────────────────────────────────────────────────────

export function takeSnapshot(): MultichainSnapshot {
  const disc  = getDiscoveryStats();
  const brid  = getBridgeStats();
  const pool  = getPoolStats();
  const wrap  = getWrappedStats();
  const msg   = getMessagingStats();

  // Distinct chains with any active presence
  const activeChainNames = new Set<string>();
  getBridges().filter((b) => b.status === "active").forEach((b) => activeChainNames.add(b.destination));
  getPools().filter((p) => p.status === "active").forEach((p) => activeChainNames.add(p.chain));
  getWrappedAssets().filter((a) => a.status === "active").forEach((a) => activeChainNames.add(a.network));

  const gstExternalLiquidity_USD = pool.totalTVL_USD + wrap.totalMarketCap_USD;

  // Health score: weighted bridge success (30) + pool APY proxy (20) + peg health (20) + msg delivery (30)
  const bridgeHealth  = Math.min(100, brid.avgSuccessRate  * 100);
  const poolHealth    = Math.min(100, pool.avgAPY * 2);          // 50% APY → 100 score
  const pegHealth     = Math.max(0, 100 - wrap.avgPegDeviation_pct * 20);
  const msgHealth     = Math.min(100, msg.successRate * 100);
  const interchainHealthScore = Math.round(
    bridgeHealth * 0.30 + poolHealth * 0.20 + pegHealth * 0.20 + msgHealth * 0.30,
  );

  const snapshot: MultichainSnapshot = {
    timestamp: Date.now(),
    discovery: {
      totalChains:     disc.total,
      activeChains:    disc.active,
      deployingChains: disc.deploying,
      targetChains:    disc.targeted,
      avgScore:        disc.avgScore,
      totalTVL_USD:    disc.totalTVL_USD,
    },
    bridges: {
      total:           brid.total,
      active:          brid.active,
      deploying:       brid.deploying,
      totalVolume_USD: brid.totalVolume_USD,
      dailyVolume_USD: brid.dailyVolume_USD,
      totalTxCount:    brid.totalTxCount,
      avgSuccessRate:  brid.avgSuccessRate,
    },
    liquidity: {
      total:            pool.total,
      active:           pool.active,
      totalTVL_USD:     pool.totalTVL_USD,
      totalVolume24h:   pool.totalVolume24h,
      totalFees24h:     pool.totalFees24h,
      gstRewardsPerDay: pool.gstRewardsPerDay,
      avgAPY:           pool.avgAPY,
      chains:           pool.chains,
    },
    wrappedAssets: {
      total:                  wrap.total,
      active:                 wrap.active,
      totalCirculatingSupply: wrap.totalCirculatingSupply,
      totalMarketCap_USD:     wrap.totalMarketCap_USD,
      totalVolume24h_USD:     wrap.totalVolume24h_USD,
      totalHolders:           wrap.totalHolders,
      avgPegDeviation_pct:    wrap.avgPegDeviation_pct,
    },
    messaging: {
      total:            msg.total,
      delivered:        msg.delivered,
      queued:           msg.queued,
      failed:           msg.failed,
      successRate:      msg.successRate,
      totalGasPaid_USD: msg.totalGasPaid_USD,
    },
    gstExternalLiquidity_USD,
    multiChainReach: activeChainNames.size,
    interchainHealthScore,
  };

  snapshots.push(snapshot);
  while (snapshots.length > MAX_SNAPSHOTS) snapshots.shift();

  logger.info(`[MultichainAnalytics] Snapshot — ${activeChainNames.size} chains active, health=${interchainHealthScore}/100, liquidity=$${(gstExternalLiquidity_USD / 1e6).toFixed(2)}M`);
  return snapshot;
}

// ── Per-chain performance ─────────────────────────────────────────────────────

export function getChainPerformances(): ChainPerformance[] {
  const chainNames = new Set<string>();
  getAllChains().forEach((c) => chainNames.add(c.name));

  const perfs: ChainPerformance[] = [];

  for (const chain of chainNames) {
    const bridge      = getBridges().find((b) => b.destination === chain);
    const chainPools  = getPools(chain).filter((p) => p.status === "active");
    const wgst        = getWrappedAssets().find((a) => a.network === chain);
    const chainData   = getAllChains().find((c) => c.name === chain);

    const bridgeVol   = bridge?.dailyVolume_USD    ?? 0;
    const poolTVL     = chainPools.reduce((s, p) => s + p.tvl_USD, 0);
    const wgstMcap    = wgst?.marketCap_USD ?? 0;
    const msgs        = chainData?.messagesRelayed ?? 0;
    const score       = chainData?.overallScore    ?? 0;

    const totalPresence = bridgeVol + poolTVL + wgstMcap;
    const healthStatus: ChainPerformance["healthStatus"] =
      totalPresence > 1_000_000                    ? "excellent"
      : totalPresence > 100_000                    ? "good"
      : totalPresence > 0                          ? "degraded"
      :                                              "offline";

    perfs.push({ chain, bridgeVolume_USD: bridgeVol, poolTVL_USD: poolTVL, wGSTMarketCap_USD: wgstMcap, messagesRelayed: msgs, overallScore: score, healthStatus });
  }

  return perfs.sort((a, b) => (b.bridgeVolume_USD + b.poolTVL_USD) - (a.bridgeVolume_USD + a.poolTVL_USD));
}

// ── Queries ───────────────────────────────────────────────────────────────────

export function getLatestSnapshot(): MultichainSnapshot | null {
  return snapshots.length > 0 ? snapshots[snapshots.length - 1]! : null;
}

export function getSnapshotHistory(limit = 48): MultichainSnapshot[] {
  return snapshots.slice(-limit);
}

export function analyzeMultichain() {
  const latest = getLatestSnapshot();
  if (!latest) return null;
  return {
    ...latest,
    chainPerformances: getChainPerformances(),
    trend: snapshots.length >= 2
      ? {
          tvlDelta:    latest.liquidity.totalTVL_USD - snapshots[snapshots.length - 2]!.liquidity.totalTVL_USD,
          volumeDelta: latest.bridges.dailyVolume_USD - snapshots[snapshots.length - 2]!.bridges.dailyVolume_USD,
          healthDelta: latest.interchainHealthScore - snapshots[snapshots.length - 2]!.interchainHealthScore,
        }
      : null,
  };
}
