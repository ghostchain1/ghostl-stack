/**
 * GhostChain AI Validator Network — Fork Predictor
 *
 * Predicts the probability of a chain fork by analyzing recent block-time
 * variance, missed-block patterns, and validator vote divergence.
 *
 * Algorithm:
 *   1. Compute rolling standard deviation of inter-block intervals.
 *   2. Raise a fork-risk signal when stddev exceeds a configured threshold.
 *   3. Boost risk score when multiple validators miss blocks simultaneously.
 *   4. Forward high-risk signals to GhostBrain Core for governance alerting.
 *
 * Chain routing law: advisory signals only — GhostBrain ratifies any action.
 * Gas token: GST.
 *
 * SECURITY:
 *   - Input arrays are bounded (MAX_SAMPLE_SIZE) to prevent DoS via
 *     arbitrarily large history feeds.
 *   - No private keys; read-only prediction layer.
 */

import type { ChainId } from "../monitor/validator_monitor.js";

// ── Types ──────────────────────────────────────────────────────────────────

/** Inter-block timing sample: timestamp of block finalization in seconds. */
export interface BlockTimeSample {
  chainId:   ChainId;
  height:    number;
  timestamp: number;
}

export type ForkRiskLevel = "none" | "low" | "medium" | "high" | "critical";

export interface ForkPrediction {
  chainId:       ChainId;
  timestamp:     number;
  riskLevel:     ForkRiskLevel;
  /** Computed score in [0, 1]. */
  riskScore:     number;
  /** Standard deviation of inter-block intervals (seconds). */
  blockTimeStdDev: number;
  /** Mean inter-block interval (seconds). */
  blockTimeMean:   number;
  samplesUsed:     number;
  /** Concurrent missed-block count contributed to this prediction. */
  concurrentMissedBlocks: number;
}

// ── ForkPredictor ─────────────────────────────────────────────────────────

export interface ForkPredictorOptions {
  ghostbrainUrl?: string;
  /** Standard deviation (seconds) for low/medium/high/critical thresholds. */
  thresholds?: { low: number; medium: number; high: number; critical: number };
  /** Minimum samples required before emitting a non-"none" prediction. */
  minSamples?:   number;
  /** Rolling window size (number of blocks). */
  windowSize?:   number;
}

const DEFAULT_THRESHOLDS = {
  low:      2,    // >2 s stddev
  medium:   5,    // >5 s
  high:     10,   // >10 s
  critical: 20,   // >20 s
};

const MAX_SAMPLE_SIZE = 500;

export class ForkPredictor {
  private readonly ghostbrainUrl: string;
  private readonly thresholds:    { low: number; medium: number; high: number; critical: number };
  private readonly minSamples:    number;
  private readonly windowSize:    number;

  /** Rolling block-time samples keyed by chainId. */
  private readonly samples = new Map<ChainId, BlockTimeSample[]>();

  constructor(opts: ForkPredictorOptions = {}) {
    this.ghostbrainUrl = opts.ghostbrainUrl ?? (process.env["GHOSTBRAIN_API_URL"] ?? "http://localhost:7900");
    this.thresholds    = opts.thresholds    ?? DEFAULT_THRESHOLDS;
    this.minSamples    = opts.minSamples    ?? 10;
    this.windowSize    = Math.min(opts.windowSize ?? 100, MAX_SAMPLE_SIZE);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /** Ingest a new block timestamp and return an updated fork prediction. */
  async ingest(sample: BlockTimeSample, concurrentMissedBlocks = 0): Promise<ForkPrediction> {
    this.addSample(sample);
    return this.predict(sample.chainId, concurrentMissedBlocks);
  }

  /** Re-run prediction on current window without adding a new sample. */
  async predict(chainId: ChainId, concurrentMissedBlocks = 0): Promise<ForkPrediction> {
    const prediction = this.compute(chainId, concurrentMissedBlocks);

    if (prediction.riskLevel === "high" || prediction.riskLevel === "critical") {
      this.forwardPrediction(prediction).catch((err: Error) =>
        console.error("[ForkPredictor] GhostBrain forward error:", err.message),
      );
    }

    return prediction;
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private addSample(s: BlockTimeSample): void {
    if (!this.samples.has(s.chainId)) this.samples.set(s.chainId, []);
    const buf = this.samples.get(s.chainId)!;
    buf.push(s);
    if (buf.length > this.windowSize) buf.shift();
  }

  private compute(chainId: ChainId, concurrentMissedBlocks: number): ForkPrediction {
    const now    = Math.floor(Date.now() / 1000);
    const buf    = this.samples.get(chainId) ?? [];

    if (buf.length < this.minSamples) {
      return {
        chainId, timestamp: now, riskLevel: "none", riskScore: 0,
        blockTimeStdDev: 0, blockTimeMean: 0,
        samplesUsed: buf.length, concurrentMissedBlocks,
      };
    }

    // Compute inter-block intervals.
    const intervals: number[] = [];
    for (let i = 1; i < buf.length; i++) {
      intervals.push(buf[i]!.timestamp - buf[i - 1]!.timestamp);
    }

    const mean   = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const stdDev = Math.sqrt(
      intervals.reduce((sum, v) => sum + (v - mean) ** 2, 0) / intervals.length,
    );

    // Base score from stddev thresholds (linear interpolation within each band).
    let baseScore = 0;
    const { low, medium, high, critical } = this.thresholds;
    if (stdDev >= critical)     baseScore = 1.0;
    else if (stdDev >= high)    baseScore = 0.75 + 0.25 * ((stdDev - high)    / (critical - high));
    else if (stdDev >= medium)  baseScore = 0.50 + 0.25 * ((stdDev - medium)  / (high - medium));
    else if (stdDev >= low)     baseScore = 0.25 + 0.25 * ((stdDev - low)     / (medium - low));

    // Boost for concurrent missed blocks (each missed validator adds 5%, capped at +0.20).
    const missedBoost = Math.min(concurrentMissedBlocks * 0.05, 0.20);
    const riskScore   = Math.min(baseScore + missedBoost, 1.0);

    const riskLevel = this.scoreToLevel(riskScore);

    return {
      chainId, timestamp: now,
      riskLevel, riskScore,
      blockTimeStdDev: stdDev,
      blockTimeMean:   mean,
      samplesUsed:     intervals.length + 1,
      concurrentMissedBlocks,
    };
  }

  private scoreToLevel(score: number): ForkRiskLevel {
    if (score >= 0.90) return "critical";
    if (score >= 0.65) return "high";
    if (score >= 0.40) return "medium";
    if (score >= 0.15) return "low";
    return "none";
  }

  private async forwardPrediction(p: ForkPrediction): Promise<void> {
    const resp = await fetch(`${this.ghostbrainUrl}/validator/fork-prediction`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ chain_id: p.chainId, gas_token: "GST", prediction: p }),
    });
    if (!resp.ok) throw new Error(`GhostBrain responded ${resp.status}`);
  }
}
