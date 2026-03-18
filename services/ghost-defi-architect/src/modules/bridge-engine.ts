/**
 * bridge-engine.ts — Cross-layer liquidity routing design module.
 *
 * Designs the liquidity flow configuration for L3 → L2 → L1 (GhostChain) bridging.
 * Produces routing config objects consumed by the infra layer.
 * No Solidity generation — bridge contracts are protocol-level, not generated.
 */

import { getAmountOut, simulateMultiHop, type PoolState } from "../math/amm-math.js";

// ── Canonical bridge addresses (from copilot-instructions.md) ─────────────────
export const BRIDGE_ADDRESSES = {
  L2L3Bridge:        "0xDadd1125B8Df98A66Abd5EB302C0d9Ca5A061dC2",
  L1RollupForL2:     "0xad32D5C2Da9f4159C4cc98686C005852b3905355",
  L2RollupForL3:     "0x130A46b6E41DB6E1e18fb9c759F223c459190e90",
  FinalityOracleL1:  "0x7B3Be2dDDdDf9A0a3fE1DC57B98980F662C3a422",
  FinalityOracleL2:  "0x650aEF4b63095e4EDe581BC79CdeA927e3ba553A",
  FinalityOracleL3:  "0x87F850cbC2cFfac086F20d0d7307E12d06fA2127",
} as const;

// ── Chain IDs ─────────────────────────────────────────────────────────────────
export const CHAIN_IDS = {
  L1: 14000101,
  L2: 901,
  L3: 903,
} as const;

// ── RPC endpoints ─────────────────────────────────────────────────────────────
export const RPC_ENDPOINTS = {
  L1: process.env.L1_RPC ?? "http://localhost:18545",
  L2: process.env.L2_RPC ?? "http://localhost:29547",
  L3: process.env.L3_RPC ?? "http://localhost:39545",
} as const;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BridgeConfig {
  /** Project name */
  projectName: string;
  /**
   * Daily cross-layer volume (in GST wei).
   * The engine computes optimal liquidity allocation per layer.
   */
  dailyVolume: bigint;
  /**
   * Target maximum single-tx bridge wait time (seconds).
   * L3→L2: OP Stack challenge window = 7 days.
   * Expressed as target for fast-path liquidity.
   */
  fastPathTargetSeconds?: number;
  /**
   * Liquidity buffer multiplier: how many times average daily volume to hold per bridge leg.
   * Default: 3x
   */
  bufferMultiplier?: number;
  /** Finality oracle health check URL override */
  finalityOracleUrl?: string;
}

export interface BridgeDesignOutput {
  routingConfig: LayeredRoutingConfig;
  simulation:    BridgeSimulation;
}

export interface LayeredRoutingConfig {
  projectName: string;
  chains: {
    L1: ChainBridgeConfig;
    L2: ChainBridgeConfig;
    L3: ChainBridgeConfig;
  };
  bridges: BridgeLegConfig[];
  finalityOracles: typeof BRIDGE_ADDRESSES;
}

export interface ChainBridgeConfig {
  chainId:         number;
  rpc:             string;
  /** Recommended liquidity reserve (GST wei) on this chain */
  recommendedLiquidity: bigint;
}

export interface BridgeLegConfig {
  from:         "L1" | "L2" | "L3";
  to:           "L1" | "L2" | "L3";
  bridgeAddress: string;
  /** Estimated settlement seconds for this leg */
  settlementSeconds: number;
  /** Recommended liquidity for fast-path on this leg */
  fastPathLiquidity: bigint;
}

export interface BridgeSimulation {
  /** Estimated daily bridge cost (in GST wei, assuming 0.1% bridge fee) */
  estimatedDailyFee: bigint;
  /** L3 → L2 settlement time (fast-path) seconds */
  l3ToL2FastPath: number;
  /** L2 → L1 settlement time seconds */
  l2ToL1Settlement: number;
  /** Multi-hop simulation: bridging dailyVolume L3 → L2 → L1 (same-asset swap equivalent) */
  crossLayerSlippage: string;
}

// ── Engine ────────────────────────────────────────────────────────────────────

export function designBridge(config: BridgeConfig): BridgeDesignOutput {
  const bufferMult = config.bufferMultiplier ?? 3;

  // Liquidity per layer = bufferMult × daily volume
  const liquidityPerLayer = config.dailyVolume * BigInt(bufferMult);

  // Fast-path targets
  const l3ToL2FastPath = config.fastPathTargetSeconds ?? 60; // 60s fast path via liquidity pool
  const l2ToL1Settlement = 604_800; // 7-day OP Stack challenge window

  // Canonical bridge legs
  const bridges: BridgeLegConfig[] = [
    {
      from: "L3",
      to:   "L2",
      bridgeAddress:     BRIDGE_ADDRESSES.L2L3Bridge,
      settlementSeconds: l3ToL2FastPath,
      fastPathLiquidity: liquidityPerLayer,
    },
    {
      from: "L2",
      to:   "L1",
      bridgeAddress:     BRIDGE_ADDRESSES.L1RollupForL2,
      settlementSeconds: l2ToL1Settlement,
      fastPathLiquidity: liquidityPerLayer * 7n, // cover 7-day window
    },
    {
      from: "L1",
      to:   "L2",
      bridgeAddress:     BRIDGE_ADDRESSES.L1RollupForL2,
      settlementSeconds: 900,   // ~15 min deposit on L2
      fastPathLiquidity: liquidityPerLayer / 2n,
    },
    {
      from: "L2",
      to:   "L3",
      bridgeAddress:     BRIDGE_ADDRESSES.L2RollupForL3,
      settlementSeconds: 900,
      fastPathLiquidity: liquidityPerLayer / 2n,
    },
  ];

  const routingConfig: LayeredRoutingConfig = {
    projectName: config.projectName,
    chains: {
      L1: { chainId: CHAIN_IDS.L1, rpc: RPC_ENDPOINTS.L1, recommendedLiquidity: liquidityPerLayer * 7n },
      L2: { chainId: CHAIN_IDS.L2, rpc: RPC_ENDPOINTS.L2, recommendedLiquidity: liquidityPerLayer },
      L3: { chainId: CHAIN_IDS.L3, rpc: RPC_ENDPOINTS.L3, recommendedLiquidity: liquidityPerLayer },
    },
    bridges,
    finalityOracles: BRIDGE_ADDRESSES,
  };

  // ── Simulation ─────────────────────────────────────────────────────────────
  // Bridge fee simulation: 0.1% per leg (L3→L2→L1 = two legs = 0.2%)
  const bridgeFeeBps = 10; // 0.1% per leg
  const RESERVE = 50_000_000n * 10n ** 18n; // 50M GST liquidity per pool

  const hop1: PoolState = { reserve0: RESERVE, reserve1: RESERVE, feeBps: bridgeFeeBps };
  const hop2: PoolState = { reserve0: RESERVE, reserve1: RESERVE, feeBps: bridgeFeeBps };
  const { amountOut: crossLayerOut } = simulateMultiHop(config.dailyVolume, [hop1, hop2]);

  const slippage = config.dailyVolume > 0n
    ? (1 - Number(crossLayerOut) / Number(config.dailyVolume)) * 100
    : 0;

  const estimatedDailyFee = config.dailyVolume * 2n * BigInt(bridgeFeeBps) / 10_000n;

  const simulation: BridgeSimulation = {
    estimatedDailyFee,
    l3ToL2FastPath,
    l2ToL1Settlement,
    crossLayerSlippage: `${slippage.toFixed(4)}%`,
  };

  return { routingConfig, simulation };
}
