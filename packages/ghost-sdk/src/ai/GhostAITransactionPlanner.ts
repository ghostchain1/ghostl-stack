/**
 * GhostAITransactionPlanner
 *
 * Analyses a transaction request and suggests the optimal execution strategy:
 * - which layer to execute on (L1 / L2 / L3)
 * - whether to batch with other pending txs
 * - optimal nonce and timing
 * - gas ceiling recommendation
 */

import type { GhostLayer } from "../networks.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TxIntent {
  /** Target contract or EOA address */
  to: string;
  /** Call data (hex) if contract interaction */
  data?: string;
  /** Value in GhostWei */
  value?: bigint;
  /** Estimated gas units (if known) */
  gasEstimate?: bigint;
  /** Urgency: low → cheap & slow, high → fast & expensive */
  urgency?: "low" | "normal" | "high";
  /** Preferred execution layer (planner may override based on analysis) */
  preferredLayer?: GhostLayer;
}

export interface LayerLoad {
  layer:       GhostLayer;
  mempoolSize: number;
  /** Avg base fee in GhostWei for recent blocks */
  avgBaseFee:  bigint;
  /** Transactions per second on this layer */
  tps:         number;
}

export interface TxPlan {
  /** Recommended layer for execution */
  recommendedLayer: GhostLayer;
  /** Reason for layer selection */
  layerReason: string;
  /** Suggested maxFeePerGas */
  maxFeePerGas: bigint;
  /** Suggested maxPriorityFeePerGas */
  maxPriorityFeePerGas: bigint;
  /** Should caller wait for low-traffic window? */
  suggestWait: boolean;
  /** Estimated confirmation time in seconds */
  estimatedSeconds: number;
  /** Whether to batch with other pending txs if possible */
  suggestBatch: boolean;
  /** Planning confidence 0–1 */
  confidence: number;
}

export interface TransactionPlannerConfig {
  /** Prefer L2 for most operations (cheaper). Default: true */
  preferL2?: boolean;
  /** Value threshold below which L3 is preferred in GhostWei. Default: 1 ether */
  l3Below?: bigint;
  /** Threshold base fee beyond which planner suggests waiting. Default: 50 Gwei */
  congestionThreshold?: bigint;
}

// ── GhostAITransactionPlanner ─────────────────────────────────────────────────

export class GhostAITransactionPlanner {
  private readonly preferL2:              boolean;
  private readonly l3BelowThreshold:      bigint;
  private readonly congestionThreshold:   bigint;

  constructor(config: TransactionPlannerConfig = {}) {
    this.preferL2            = config.preferL2            ?? true;
    this.l3BelowThreshold    = config.l3Below             ?? 1_000_000_000_000_000_000n; // 1 ether
    this.congestionThreshold = config.congestionThreshold ?? 50_000_000_000n;            // 50 Gwei
  }

  /**
   * Produce a transaction execution plan given intent and current layer loads.
   */
  plan(intent: TxIntent, loads: LayerLoad[]): TxPlan {
    const loadMap = new Map(loads.map(l => [l.layer, l]));

    // ── Layer selection ───────────────────────────────────────────────────
    const layer      = this._selectLayer(intent, loadMap);
    const layerLoad  = loadMap.get(layer);
    const layerReason = this._layerReason(intent, layer);

    // ── Fee suggestion ────────────────────────────────────────────────────
    const baseFee   = layerLoad?.avgBaseFee ?? 1_000_000_000n;
    const urgencyM  = intent.urgency === "high" ? 1.4 : intent.urgency === "low" ? 0.7 : 1.0;
    const congestionM = layerLoad && layerLoad.avgBaseFee > this.congestionThreshold ? 1.2 : 1.0;
    const mul = urgencyM * congestionM;

    const maxFeePerGas = this._scaleBigInt(baseFee, mul * 1.125);
    const maxPriorityFeePerGas = this._scaleBigInt(
      1_000_000_000n,
      intent.urgency === "high" ? 2 : intent.urgency === "low" ? 0.5 : 1
    );

    // ── Wait suggestion ───────────────────────────────────────────────────
    const congested  = (layerLoad?.mempoolSize ?? 0) > 5000;
    const highFee    = (layerLoad?.avgBaseFee  ?? 0n) > this.congestionThreshold;
    const suggestWait = (congested || highFee) && intent.urgency !== "high";

    // ── Estimated confirmation time ───────────────────────────────────────
    const tps = layerLoad?.tps ?? 10;
    const mem = layerLoad?.mempoolSize ?? 500;
    const estimatedSeconds = Math.max(2, Math.round((mem / tps) * urgencyM));

    // ── Batch suggestion ──────────────────────────────────────────────────
    const suggestBatch = (intent.urgency !== "high") &&
                         (intent.value ?? 0n) === 0n &&
                         Boolean(intent.data);

    const confidence = this._confidence(loadMap);

    return {
      recommendedLayer: layer,
      layerReason,
      maxFeePerGas,
      maxPriorityFeePerGas,
      suggestWait,
      estimatedSeconds,
      suggestBatch,
      confidence,
    };
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private _selectLayer(intent: TxIntent, loads: Map<GhostLayer, LayerLoad>): GhostLayer {
    if (intent.preferredLayer) return intent.preferredLayer;

    // Large value transfers → L1 for finality
    const value = intent.value ?? 0n;
    if (value > 100_000_000_000_000_000_000n) return "L1"; // > 100 ether

    // Small value / pure data → L3 (cheapest)
    if (value > 0n && value < this.l3BelowThreshold && !intent.data) return "L3";

    // Contract calls default to L2 (balanced cost + finality)
    if (this.preferL2) return "L2";

    // Pick least congested layer
    let best: GhostLayer = "L2";
    let bestLoad = Infinity;
    for (const [layer, info] of loads) {
      if (info.mempoolSize < bestLoad) {
        bestLoad = info.mempoolSize;
        best = layer;
      }
    }
    return best;
  }

  private _layerReason(intent: TxIntent, layer: GhostLayer): string {
    if (intent.preferredLayer) return "caller-specified layer preference";
    if (layer === "L1") return "large value transfer routed to L1 for maximum finality";
    if (layer === "L3") return "small-value transfer routed to L3 for minimum cost";
    return "contract call routed to L2 for optimal cost–finality balance";
  }

  private _scaleBigInt(base: bigint, mul: number): bigint {
    return (base * BigInt(Math.round(mul * 1000))) / 1000n;
  }

  private _confidence(loads: Map<GhostLayer, LayerLoad>): number {
    return loads.size >= 3 ? 0.88 : loads.size === 2 ? 0.72 : 0.50;
  }
}
