/**
 * GhostAIGasOptimizer
 *
 * Heuristic + learning-based gas price optimizer.
 * Predicts the optimal GST maxFeePerGas and maxPriorityFeePerGas
 * for a transaction to land within a target confirmation window.
 *
 * Integrates with GhostBrain telemetry for continuous learning — when
 * GhostBrain is offline, local statistical heuristics apply.
 */

import type { GhostFeeSuggestion } from "../native/types.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NetworkStats {
  /** Current mempool pending transaction count */
  mempoolSize: number;
  /** Current base gas price in GhostWei (wei) */
  baseGas: bigint;
  /** Average block utilisation 0–1 (1 = 100% full blocks) */
  utilisation?: number;
  /** Recent block median priority fee in GhostWei */
  medianPriorityFee?: bigint;
  /** Seconds since last block */
  timeSinceLastBlock?: number;
}

export interface GasOptimisationResult {
  /** Recommended maxFeePerGas */
  maxFeePerGas: bigint;
  /** Recommended maxPriorityFeePerGas */
  maxPriorityFeePerGas: bigint;
  /** Predicted confirmation speed */
  speed: "fast" | "standard" | "slow";
  /** Confidence level 0–1 */
  confidence: number;
  /** Reason text */
  reason: string;
}

export interface GasOptimizerConfig {
  /**
   * Target confirmation speed.
   * fast     → 1–2 blocks, standard → 3–6 blocks, slow → 6+ blocks.
   * Default: "standard"
   */
  targetSpeed?: "fast" | "standard" | "slow";
  /**
   * Maximum multiplier applied on top of base gas (safety ceiling).
   * Default: 3.0
   */
  maxMultiplier?: number;
  /**
   * Floor multiplier — never suggest less than base × this.
   * Default: 0.6
   */
  floorMultiplier?: number;
  /**
   * Minimum priority fee in GhostWei. Default: 1_000_000n (1 Gwei)
   */
  minPriorityFee?: bigint;
}

// ── Internal block history ────────────────────────────────────────────────────

interface BlockSample {
  baseGas:      bigint;
  mempoolSize:  number;
  utilisation:  number;
  timestamp:    number;
}

// ── GhostAIGasOptimizer ───────────────────────────────────────────────────────

export class GhostAIGasOptimizer {
  private readonly targetSpeed:     "fast" | "standard" | "slow";
  private readonly maxMultiplier:   number;
  private readonly floorMultiplier: number;
  private readonly minPriorityFee:  bigint;
  private readonly history:         BlockSample[] = [];
  private readonly maxHistoryLen = 50;

  constructor(config: GasOptimizerConfig = {}) {
    this.targetSpeed     = config.targetSpeed     ?? "standard";
    this.maxMultiplier   = config.maxMultiplier   ?? 3.0;
    this.floorMultiplier = config.floorMultiplier ?? 0.6;
    this.minPriorityFee  = config.minPriorityFee  ?? 1_000_000_000n; // 1 Gwei
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Compute an optimised fee suggestion for the given network state.
   */
  optimize(stats: NetworkStats): GasOptimisationResult {
    this._recordSample(stats);

    const trend    = this._computeTrend();
    const speedMul = this._speedMultiplier();
    const congMul  = this._congestionMultiplier(stats.mempoolSize);
    const trendMul = 1 + trend * 0.15; // ±15 % trend adjustment

    const totalMul  = Math.min(
      Math.max(speedMul * congMul * trendMul, this.floorMultiplier),
      this.maxMultiplier
    );

    const maxFeePerGas = this._applyMul(stats.baseGas, totalMul);

    // Priority fee: median * speedFactor, at least minPriorityFee
    const medianPriority = stats.medianPriorityFee ?? 1_000_000_000n;
    const priorityMul    = this.targetSpeed === "fast"   ? 1.5
                         : this.targetSpeed === "slow"   ? 0.5 : 1.0;
    const maxPriorityFeePerGas = this._max(
      this._applyMul(medianPriority, priorityMul),
      this.minPriorityFee
    );

    const confidence = this._confidence(stats);
    const speed      = this._resultSpeed(stats.mempoolSize, totalMul);
    const reason     = this._reason(stats.mempoolSize, totalMul, trend);

    return { maxFeePerGas, maxPriorityFeePerGas, speed, confidence, reason };
  }

  /**
   * Simplified form: returns a GhostFeeSuggestion directly.
   */
  suggest(stats: NetworkStats): GhostFeeSuggestion {
    const result = this.optimize(stats);
    return {
      maxFeePerGas:        result.maxFeePerGas,
      maxPriorityFeePerGas: result.maxPriorityFeePerGas,
      baseFeePerGas:        stats.baseGas,
    };
  }

  /** Feed a new block sample to improve future predictions. */
  recordBlock(sample: {
    baseGas: bigint;
    mempoolSize: number;
    utilisation?: number;
  }): void {
    this._recordSample({ ...sample, utilisation: sample.utilisation ?? 0.5 } as NetworkStats);
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  private _recordSample(stats: NetworkStats): void {
    this.history.push({
      baseGas:     stats.baseGas,
      mempoolSize: stats.mempoolSize,
      utilisation: stats.utilisation ?? 0.5,
      timestamp:   Date.now(),
    });
    if (this.history.length > this.maxHistoryLen) {
      this.history.shift();
    }
  }

  /** Returns trend in [-1, +1] based on recent base gas direction. */
  private _computeTrend(): number {
    if (this.history.length < 3) return 0;
    const last  = Number(this.history[this.history.length - 1].baseGas);
    const first = Number(this.history[0].baseGas);
    if (first === 0) return 0;
    return Math.max(-1, Math.min(1, (last - first) / first));
  }

  private _speedMultiplier(): number {
    return this.targetSpeed === "fast"   ? 1.35
         : this.targetSpeed === "slow"   ? 0.75 : 1.0;
  }

  private _congestionMultiplier(mempoolSize: number): number {
    if (mempoolSize > 10_000) return 1.4;
    if (mempoolSize > 5_000)  return 1.2;
    if (mempoolSize < 500)    return 0.7;
    if (mempoolSize < 1_000)  return 0.8;
    return 1.0;
  }

  private _applyMul(base: bigint, mul: number): bigint {
    const scaled = BigInt(Math.round(mul * 1000));
    return (base * scaled) / 1000n;
  }

  private _max(a: bigint, b: bigint): bigint {
    return a > b ? a : b;
  }

  private _confidence(stats: NetworkStats): number {
    const samples  = Math.min(this.history.length / 10, 1);
    const memBonus = stats.mempoolSize < 2000 ? 0.15 : 0;
    return Math.min(0.5 + samples * 0.4 + memBonus, 0.95);
  }

  private _resultSpeed(mempoolSize: number, mul: number): "fast" | "standard" | "slow" {
    if (mul >= 1.3 && mempoolSize < 5000) return "fast";
    if (mul <= 0.8 || mempoolSize > 8000) return "slow";
    return "standard";
  }

  private _reason(mempoolSize: number, mul: number, trend: number): string {
    const parts: string[] = [];
    if (mempoolSize > 5000) parts.push("high network congestion");
    else if (mempoolSize < 500) parts.push("low network congestion");
    if (trend > 0.1)  parts.push("rising base fee trend");
    else if (trend < -0.1) parts.push("falling base fee trend");
    if (mul > 1.3) parts.push("aggressive multiplier for fast confirmation");
    else if (mul < 0.8) parts.push("conservative multiplier to save GST");
    return parts.length ? parts.join("; ") : "standard market conditions";
  }
}
