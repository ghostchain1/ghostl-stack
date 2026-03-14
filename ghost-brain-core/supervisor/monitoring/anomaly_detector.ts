/**
 * Anomaly Detector
 *
 * Detects statistical anomalies in rolling infrastructure metrics using
 * Z-score analysis. Surfaces anomalies to the supervisor event pipeline.
 *
 * Uses only local computation — no external AI calls — so this runs even
 * when GhostBrain inference is unavailable.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MetricSample {
  timestamp: number;
  value:     number;
}

export type AnomalySeverity = "low" | "medium" | "high";

export interface Anomaly {
  metricName: string;
  value:      number;
  zScore:     number;
  severity:   AnomalySeverity;
  detectedAt: number;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const WINDOW_SIZE     = Number(process.env["ANOMALY_WINDOW_SIZE"]      ?? "60");  // samples
const Z_LOW           = Number(process.env["ANOMALY_Z_LOW"]            ?? "2.0");
const Z_MEDIUM        = Number(process.env["ANOMALY_Z_MEDIUM"]         ?? "3.0");
const Z_HIGH          = Number(process.env["ANOMALY_Z_HIGH"]           ?? "4.0");
const MIN_SAMPLES     = Number(process.env["ANOMALY_MIN_SAMPLES"]      ?? "10");

// ---------------------------------------------------------------------------
// RollingStats — Welford online algorithm for mean/variance
// ---------------------------------------------------------------------------

class RollingStats {
  private readonly window: number[];
  private readonly maxSize: number;
  private pos = 0;
  private filled = false;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
    this.window  = new Array<number>(maxSize).fill(0);
  }

  push(value: number): void {
    this.window[this.pos] = value;
    this.pos = (this.pos + 1) % this.maxSize;
    if (this.pos === 0) this.filled = true;
  }

  count(): number {
    return this.filled ? this.maxSize : this.pos;
  }

  mean(): number {
    const n = this.count();
    if (n === 0) return 0;
    return this.window.slice(0, n).reduce((a, b) => a + b, 0) / n;
  }

  stddev(): number {
    const n = this.count();
    if (n < 2) return 0;
    const mu = this.mean();
    const data = this.window.slice(0, n);
    const variance = data.reduce((acc, x) => acc + (x - mu) ** 2, 0) / (n - 1);
    return Math.sqrt(variance);
  }
}

// ---------------------------------------------------------------------------
// AnomalyDetector
// ---------------------------------------------------------------------------

export class AnomalyDetector {
  private readonly stats = new Map<string, RollingStats>();

  /**
   * Record a new sample for a named metric and return an Anomaly if the
   * value is statistically unusual, otherwise null.
   */
  observe(metricName: string, value: number): Anomaly | null {
    if (!this.stats.has(metricName)) {
      this.stats.set(metricName, new RollingStats(WINDOW_SIZE));
    }
    const s = this.stats.get(metricName)!;

    // Push before computing so the new point is included in future windows,
    // but compute z-score against the existing distribution first.
    const n      = s.count();
    const mu     = s.mean();
    const sigma  = s.stddev();

    s.push(value);

    if (n < MIN_SAMPLES || sigma === 0) return null;

    const zScore = Math.abs((value - mu) / sigma);

    let severity: AnomalySeverity | null = null;
    if (zScore >= Z_HIGH)   severity = "high";
    else if (zScore >= Z_MEDIUM) severity = "medium";
    else if (zScore >= Z_LOW)    severity = "low";

    if (!severity) return null;

    const anomaly: Anomaly = {
      metricName,
      value,
      zScore,
      severity,
      detectedAt: Date.now(),
    };

    console.warn(
      `[AnomalyDetector] ${severity.toUpperCase()} anomaly in "${metricName}": ` +
      `value=${value.toFixed(2)} z=${zScore.toFixed(2)} (μ=${mu.toFixed(2)} σ=${sigma.toFixed(2)})`
    );

    return anomaly;
  }

  /**
   * Observe a named set of numeric metrics and return all anomalies found.
   */
  observeAll(metrics: Record<string, number>): Anomaly[] {
    const found: Anomaly[] = [];
    for (const [name, value] of Object.entries(metrics)) {
      const anomaly = this.observe(name, value);
      if (anomaly) found.push(anomaly);
    }
    return found;
  }

  /** Reset all rolling statistics (e.g. after a known maintenance window). */
  reset(): void {
    this.stats.clear();
  }
}
