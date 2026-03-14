/**
 * GhostChain AI Validator Network — Latency Predictor
 *
 * Analyzes per-validator network latency and predicts upcoming spikes
 * before they cause missed blocks or consensus delays.
 *
 * Algorithm:
 *   1. Maintain a rolling Exponential Weighted Moving Average (EWMA)
 *      of each validator's round-trip ping latency.
 *   2. Compute a Z-score for the latest observation vs. the EWMA baseline.
 *   3. Emit a spike prediction when the Z-score exceeds a threshold.
 *   4. Forward high-severity predictions to GhostBrain for load-balancing.
 *
 * Chain routing law: advisory predictions only — never triggers on-chain
 * actions autonomously. Gas token: GST.
 *
 * SECURITY:
 *   - Input latency values are clamped to [0, MAX_LATENCY_MS] to prevent
 *     outlier injection skewing the EWMA.
 *   - Validator IDs are treated as opaque strings; never interpolated into
 *     shell or SQL contexts.
 */

import type { ChainId } from "../monitor/validator_monitor.js";

// ── Types ──────────────────────────────────────────────────────────────────

export interface LatencySample {
  validatorId: string;
  chainId:     ChainId;
  /** Round-trip latency in milliseconds. */
  latencyMs:   number;
  timestamp:   number;
}

export type LatencySeverity = "ok" | "elevated" | "high" | "critical";

export interface LatencyPrediction {
  validatorId: string;
  chainId:     ChainId;
  timestamp:   number;
  severity:    LatencySeverity;
  latencyMs:   number;
  ewmaMs:      number;
  /** How many standard deviations above the EWMA this sample is. */
  zScore:      number;
  /** True when the trend is consistently worsening (3+ consecutive rises). */
  trendingUp:  boolean;
}

// ── LatencyPredictor ──────────────────────────────────────────────────────

export interface LatencyPredictorOptions {
  ghostbrainUrl?: string;
  /** EWMA smoothing factor α ∈ (0,1). Higher = faster response to changes. */
  ewmaAlpha?:              number;
  /**
   * Z-score thresholds (standard deviations above baseline) for
   * elevated / high / critical severity tiers.
   */
  zScoreThresholds?: { elevated: number; high: number; critical: number };
  /** Absolute latency (ms) thresholds — applied even when Z-score is < threshold. */
  absoluteThresholds?: { elevated: number; high: number; critical: number };
  /** Maximum clamp for incoming latency samples (prevents outlier injection). */
  maxLatencyMs?: number;
  /** Minimum samples before Z-score computation is meaningful. */
  warmupSamples?: number;
}

const DEFAULT_ZSCORE = { elevated: 1.5, high: 2.5, critical: 4.0 };
const DEFAULT_ABS    = { elevated: 150, high: 400, critical: 1000 };

export class LatencyPredictor {
  private readonly ghostbrainUrl:     string;
  private readonly ewmaAlpha:         number;
  private readonly zScoreThresholds:  { elevated: number; high: number; critical: number };
  private readonly absoluteThresholds:{ elevated: number; high: number; critical: number };
  private readonly maxLatencyMs:      number;
  private readonly warmupSamples:     number;

  /** Per-validator EWMA state. */
  private readonly ewmaState = new Map<string, { mean: number; variance: number; count: number }>();

  /** Last 3 latency observations per validator — used for trending detection. */
  private readonly trendWindow = new Map<string, number[]>();

  constructor(opts: LatencyPredictorOptions = {}) {
    this.ghostbrainUrl      = opts.ghostbrainUrl      ?? (process.env["GHOSTBRAIN_API_URL"] ?? "http://localhost:7900");
    this.ewmaAlpha          = opts.ewmaAlpha          ?? 0.15;
    this.zScoreThresholds   = opts.zScoreThresholds   ?? DEFAULT_ZSCORE;
    this.absoluteThresholds = opts.absoluteThresholds ?? DEFAULT_ABS;
    this.maxLatencyMs       = opts.maxLatencyMs       ?? 5000;
    this.warmupSamples      = opts.warmupSamples      ?? 5;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  async observe(sample: LatencySample): Promise<LatencyPrediction> {
    const clamped = Math.max(0, Math.min(sample.latencyMs, this.maxLatencyMs));
    const state   = this.updateEwma(sample.validatorId, clamped);
    const trending = this.updateTrend(sample.validatorId, clamped);

    const zScore = state.count >= this.warmupSamples && state.variance > 0
      ? (clamped - state.mean) / Math.sqrt(state.variance)
      : 0;

    const severity = this.computeSeverity(clamped, zScore);

    const prediction: LatencyPrediction = {
      validatorId: sample.validatorId,
      chainId:     sample.chainId,
      timestamp:   sample.timestamp,
      severity,
      latencyMs:   clamped,
      ewmaMs:      state.mean,
      zScore,
      trendingUp:  trending,
    };

    if (severity === "high" || severity === "critical") {
      this.forwardPrediction(prediction).catch((err: Error) =>
        console.error("[LatencyPredictor] GhostBrain forward error:", err.message),
      );
    }

    return prediction;
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  /** Update EWMA mean + variance (Welford online algorithm). */
  private updateEwma(
    id:       string,
    latency:  number,
  ): { mean: number; variance: number; count: number } {
    const α = this.ewmaAlpha;
    if (!this.ewmaState.has(id)) {
      this.ewmaState.set(id, { mean: latency, variance: 0, count: 1 });
      return this.ewmaState.get(id)!;
    }

    const s    = this.ewmaState.get(id)!;
    const diff = latency - s.mean;
    const newMean     = s.mean + α * diff;
    const newVariance = (1 - α) * (s.variance + α * diff * diff);
    const next        = { mean: newMean, variance: newVariance, count: s.count + 1 };
    this.ewmaState.set(id, next);
    return next;
  }

  /** Return true when the last 3 observations are strictly increasing. */
  private updateTrend(id: string, latency: number): boolean {
    if (!this.trendWindow.has(id)) this.trendWindow.set(id, []);
    const win = this.trendWindow.get(id)!;
    win.push(latency);
    if (win.length > 3) win.shift();

    return win.length === 3 && win[0]! < win[1]! && win[1]! < win[2]!;
  }

  private computeSeverity(latencyMs: number, zScore: number): LatencySeverity {
    const { critical, high, elevated } = this.zScoreThresholds;
    const abs = this.absoluteThresholds;

    if (zScore >= critical || latencyMs >= abs.critical) return "critical";
    if (zScore >= high     || latencyMs >= abs.high)     return "high";
    if (zScore >= elevated || latencyMs >= abs.elevated) return "elevated";
    return "ok";
  }

  private async forwardPrediction(p: LatencyPrediction): Promise<void> {
    const resp = await fetch(`${this.ghostbrainUrl}/validator/latency-prediction`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ chain_id: p.chainId, gas_token: "GST", prediction: p }),
    });
    if (!resp.ok) throw new Error(`GhostBrain responded ${resp.status}`);
  }
}
