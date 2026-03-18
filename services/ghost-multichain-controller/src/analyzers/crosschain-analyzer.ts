/**
 * Cross-Chain Analyzer
 *
 * Aggregates data from all external chain adapters, the bridge-risk-analyzer,
 * the liquidity-analyzer, and the treaty-manager into a single MultichainState
 * snapshot. This is the entry point for each monitoring cycle.
 *
 * All adapter calls are executed in parallel with per-adapter error isolation
 * (a failing adapter yields an unhealthy snapshot rather than aborting the cycle).
 */
import type { MultichainState, ChainSnapshot, BridgeInfo } from "../types.js";
import { getGhostbridgeSnapshot } from "../adapters/ghostbridge-adapter.js";
import { getPolygonSnapshot }  from "../adapters/polygon-adapter.js";
import { getArbitrumSnapshot } from "../adapters/arbitrum-adapter.js";
import { getSolanaSnapshot }   from "../adapters/solana-adapter.js";
import { getCosmosSnapshot }   from "../adapters/cosmos-adapter.js";
import { bridgeInfoFromSnapshot } from "./bridge-risk-analyzer.js";
import { analyzePools, analyzeMarkets } from "./liquidity-analyzer.js";
import { loadTreaties } from "../modules/treaty-manager.js";

/** Bridge name overrides from env (BRIDGE_NAME_<CHAIN> = "My Bridge Name"). */
function bridgeName(chain: string): string {
  const env = process.env[`BRIDGE_NAME_${chain.toUpperCase()}`];
  return env ?? `GhostChain ↔ ${chain.charAt(0).toUpperCase()}${chain.slice(1)}`;
}

/** Build bridge IDs per-chain. Operator can set BRIDGE_ID_<CHAIN> env var. */
function bridgeId(chain: string): string {
  const env = process.env[`BRIDGE_ID_${chain.toUpperCase()}`];
  return env ?? `L1-${chain}-bridge`;
}

/** Aggregate all external chain snapshots into BridgeInfo entries. */
function buildBridges(snapshots: ChainSnapshot[]): BridgeInfo[] {
  return snapshots.map(snap => {
    const pendingTxCount = 0; // Populated from L1 contract reads when addresses are configured
    return bridgeInfoFromSnapshot(
      bridgeId(snap.chainId),
      bridgeName(snap.chainId),
      snap,
      pendingTxCount,
    );
  });
}

export async function analyzeCrosschain(): Promise<MultichainState> {
  // Query all 5 external chain adapters in parallel — each fails gracefully
  const [ghostbridgeSnap, polySnap, arbSnap, solSnap, cosmosSnap] = await Promise.all([
    getGhostbridgeSnapshot().catch(err => ({
      chainId: "ghostbridge" as const, blockHeight: "0", healthy: false,
      latencyMs: 0, timestamp: Date.now(), error: String(err),
    })),
    getPolygonSnapshot().catch(err => ({
      chainId: "polygon" as const, blockHeight: "0", healthy: false,
      latencyMs: 0, timestamp: Date.now(), error: String(err),
    })),
    getArbitrumSnapshot().catch(err => ({
      chainId: "arbitrum" as const, blockHeight: "0", healthy: false,
      latencyMs: 0, timestamp: Date.now(), error: String(err),
    })),
    getSolanaSnapshot().catch(err => ({
      chainId: "solana" as const, blockHeight: "0", healthy: false,
      latencyMs: 0, timestamp: Date.now(), error: String(err),
    })),
    getCosmosSnapshot().catch(err => ({
      chainId: "cosmos" as const, blockHeight: "0", healthy: false,
      latencyMs: 0, timestamp: Date.now(), error: String(err),
    })),
  ]);

  const snapshots: ChainSnapshot[] = [ghostbridgeSnap, polySnap, arbSnap, solSnap, cosmosSnap];
  const bridges  = buildBridges(snapshots);

  // Build a partial state for the pool/market analyzers
  const partialState: MultichainState = {
    bridges, markets: [], pools: [], treaties: [], chainSnapshots: snapshots, timestamp: Date.now(),
  };

  const [pools, markets, treaties] = await Promise.all([
    Promise.resolve(analyzePools(partialState)),
    Promise.resolve(analyzeMarkets(partialState)),
    loadTreaties().catch(err => {
      console.warn("[crosschain-analyzer] treaty load failed:", String(err));
      return [];
    }),
  ]);

  return { bridges, markets, pools, treaties, chainSnapshots: snapshots, timestamp: Date.now() };
}
