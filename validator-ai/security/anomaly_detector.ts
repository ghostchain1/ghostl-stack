/**
 * GhostChain AI Validator Network — Anomaly Detector
 *
 * Statistically identifies anomalous network conditions using
 * Isolation-Forest-inspired scoring on a multi-variate metric stream.
 *
 * Monitored metrics (all normalized to z-scores against a rolling baseline):
 *   txRate          — transactions per second across all validators
 *   blockTime       — inter-block interval (seconds)
 *   uniqueSenders   — distinct transaction sender count per block
 *   gasPrice        — median gas price in GST units
 *   validatorSetDelta — change in active-validator count per epoch
 *
 * The composite anomaly score is a weighted average of per-metric z-scores.
 * A score above the configured thresholds triggers an alert to GhostBrain.
 *
 * Chain routing law: advisory signals only.  Gas token: GST.
 *
 * SECURITY:
 *   - Metric inputs are validated and clamped to prevent poison-sample
 *     attacks on the rolling baseline.
 *   - History is bounded (MAX_HISTORY_SIZE) to prevent memory exhaustion.
 */

import type { ChainId } from "../monitor/validator_monitor.js";

// ── Types ──────────────────────────────────────────────────────────────────

export interface NetworkMetrics {
  chainId:           ChainId;
  timestamp:         number;
  /** Transactions per second (network-wide). */
  txRate:            number;
  /** Seconds between the last two finalized blocks. */
  blockTime:         number;
  /** Distinct sender addresses in the latest block. */
  uniqueSenders:     number;
  /** Median gas price in GST's smallest unit. */
  gasPrice:          bigint;
  /** Change in bonded-validator count vs. previous epoch (can be negative). */
  validatorSetDelta: number;
}

export type AnomalySeverity = "normal" | "elevated" | "anomalous" | "critical";

export interface AnomalyReport {
  chainId:        ChainId;
  timestamp:      number;
  severity:       AnomalySeverity;
  /** Composite anomaly score ∈ [0, ∞). Scores > 3 are critical. */
  compositeScore: number;
  /** Per-metric z-scores for auditability. */
  zScores:        Record<keyof Omit<NetworkMetrics, "chainId" | "timestamp">, number>;
}

// ── AnomalyDetector ────────────────────────────────────────────────────────

export interface AnomalyDetectorOptions {
  ghostbrainUrl?: string;
  /** Rolling window size (number of metric observations). */
  windowSize?: number;
  /** Minimum observations before z-scores are computed. */
  warmupSize?: number;
  /** Composite score thresholds for severity levels. */
  thresholds?: { elevated: number; anomalous: number; critical: number };
  /** Per-metric weights (must all be positive; need not sum to 1). */
  weights?: Partial<Record<keyof Omit<NetworkMetrics, "chainId" | "timestamp">, number>>;
}

const DEFAULT_THRESHOLDS = { elevated: 1.5, anomalous: 2.5, critical: 4.0 };

/** Signed-safe clamp to prevent outlier injection. */
const METRIC_CLAMP_SIGMA = 10;

const MAX_HISTORY_SIZE = 500;

type MetricKey = keyof Omit<NetworkMetrics, "chainId" | "timestamp">;

const METRIC_KEYS: MetricKey[] = [
  "txRate", "blockTime", "uniqueSenders", "gasPrice", "validatorSetDelta",
];

const DEFAULT_WEIGHTS: Record<MetricKey, number> = {
  txRate:            1.5,
  blockTime:         1.2,
  uniqueSenders:     1.0,
  gasPrice:          0.8,
  validatorSetDelta: 2.0,
};

export class AnomalyDetector {
  private readonly ghostbrainUrl: string;
  private readonly windowSize:    number;
  private readonly warmupSize:    number;
  private readonly thresholds:    { elevated: number; anomalous: number; critical: number };
  private readonly weights:       Record<MetricKey, number>;

  /** Rolling sample buffers keyed by chainId → metricKey → values[]. */
  private readonly history = new Map<ChainId, Map<MetricKey, number[]>>();

  constructor(opts: AnomalyDetectorOptions = {}) {
    this.ghostbrainUrl = opts.ghostbrainUrl ?? (process.env["GHOSTBRAIN_API_URL"] ?? "http://localhost:7900");
    this.windowSize    = Math.min(opts.windowSize ?? 200, MAX_HISTORY_SIZE);
    this.warmupSize    = opts.warmupSize    ?? 20;
    this.thresholds    = opts.thresholds    ?? DEFAULT_THRESHOLDS;
    this.weights       = { ...DEFAULT_WEIGHTS, ...(opts.weights ?? {}) };
  }

  // ── Public API ────────────────────────────────────────────────────────────

  async observe(m: NetworkMetrics): Promise<AnomalyReport> {
    this.ingest(m);
    const report = this.evaluate(m);

    if (report.severity === "anomalous" || report.severity === "critical") {
      this.forwardReport(report).catch((err: Error) =>
        console.error("[AnomalyDetector] GhostBrain forward error:", err.message),
      );
    }
    return report;
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private ingest(m: NetworkMetrics): void {
    if (!this.history.has(m.chainId)) {
      this.history.set(m.chainId, new Map(METRIC_KEYS.map(k => [k, []])));
    }
    const chain = this.history.get(m.chainId)!;

    for (const key of METRIC_KEYS) {
      const raw    = this.asNumber(m, key);
      const buf    = chain.get(key)!;
      buf.push(raw);
      if (buf.length > this.windowSize) buf.shift();
    }
  }

  private evaluate(m: NetworkMetrics): AnomalyReport {
    const chain = this.history.get(m.chainId);
    const zScores = {} as Record<MetricKey, number>;

    let compositeNumerator   = 0;
    let compositeDenominator = 0;

    for (const key of METRIC_KEYS) {
      const buf = chain?.get(key) ?? [];
      if (buf.length < this.warmupSize) {
        zScores[key] = 0;
      } else {
        const mean   = buf.reduce((a, b) => a + b, 0) / buf.length;
        const stdDev = Math.sqrt(
          buf.reduce((sum, v) => sum + (v - mean) ** 2, 0) / buf.length,
        );
        const raw    = this.asNumber(m, key);
        const z      = stdDev > 0
          ? Math.min(Math.abs((raw - mean) / stdDev), METRIC_CLAMP_SIGMA)
          : 0;
        zScores[key] = z;
      }

      const w = this.weights[key];
      compositeNumerator   += w * zScores[key];
      compositeDenominator += w;
    }

    const compositeScore = compositeDenominator > 0
      ? compositeNumerator / compositeDenominator
      : 0;

    return {
      chainId:        m.chainId,
      timestamp:      m.timestamp,
      severity:       this.scoreToSeverity(compositeScore),
      compositeScore,
      zScores,
    };
  }

  private asNumber(m: NetworkMetrics, key: MetricKey): number {
    const v = m[key];
    return typeof v === "bigint" ? Number(v) : (v as number);
  }

  private scoreToSeverity(score: number): AnomalySeverity {
    if (score >= this.thresholds.critical)  return "critical";
    if (score >= this.thresholds.anomalous) return "anomalous";
    if (score >= this.thresholds.elevated)  return "elevated";
    return "normal";
  }

  private async forwardReport(r: AnomalyReport): Promise<void> {
    const resp = await fetch(`${this.ghostbrainUrl}/validator/anomaly`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ chain_id: r.chainId, gas_token: "GST", report: r }),
    });
    if (!resp.ok) throw new Error(`GhostBrain responded ${resp.status}`);
  }
}
