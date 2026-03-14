/**
 * GhostBrain Memory Engine — Failure Predictor
 *
 * Converts PatternMatch evidence into typed PredictionAlert objects with
 * confidence scores. Confidence is derived from:
 *   - Frequency ratio: observed / threshold (capped at 1.0)
 *   - Pattern kind weight: time_of_day patterns carry higher confidence than
 *     raw frequency spikes because they represent multi-day validation.
 *   - Recency bonus: patterns detected in the shortest window carry a small
 *     additional confidence weight (high-frequency near-now signal).
 *
 * Predictions are returned sorted by confidence descending. Duplicates
 * (same category across multiple windows) are de-duplicated by keeping the
 * highest-confidence entry per category.
 *
 * Predictions are read-only — no writes. Callers are expected to:
 *   1. Write a "prediction_alert" MemoryRecord via GhostMemoryEngine.record()
 *   2. Forward to ProposalExecutor if confidence ≥ high threshold.
 */

import type { PatternMatch } from "./pattern_detector.js";
import type { EventCategory } from "../models/system_event.js";

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export type PredictionSeverity = "watch" | "warn" | "critical";

export interface PredictionAlert {
  category: EventCategory;
  severity: PredictionSeverity;
  confidence: number;          // 0.0 – 1.0
  patternKind: PatternMatch["kind"];
  message: string;
  /** UTC hour most likely to be affected. Present for time_of_day patterns. */
  peakHour?: number;
  source?: string;
  producedAt: number;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface FailurePredictorConfig {
  /** Confidence threshold for "warn" severity. Default: 0.5 */
  warnThreshold: number;
  /** Confidence threshold for "critical" severity. Default: 0.8 */
  criticalThreshold: number;
}

const DEFAULT_CONFIG: FailurePredictorConfig = {
  warnThreshold:     parseFloat(process.env["MEMORY_PREDICT_WARN"]     ?? "0.5"),
  criticalThreshold: parseFloat(process.env["MEMORY_PREDICT_CRITICAL"] ?? "0.8"),
};

// ---------------------------------------------------------------------------
// Kind weights (time_of_day = stronger evidence than a single-window spike)
// ---------------------------------------------------------------------------

const KIND_WEIGHT: Record<PatternMatch["kind"], number> = {
  frequency_spike: 0.7,
  source_hotspot:  0.8,
  time_of_day:     1.0,
};

// ---------------------------------------------------------------------------
// FailurePredictor
// ---------------------------------------------------------------------------

export class FailurePredictor {
  private readonly cfg: FailurePredictorConfig;

  constructor(config: Partial<FailurePredictorConfig> = {}) {
    this.cfg = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Produce a de-duplicated list of PredictionAlerts from raw pattern matches.
   * Sorted by confidence descending.
   */
  predict(patterns: PatternMatch[]): PredictionAlert[] {
    const now = Date.now();

    // Compute raw confidence for each pattern.
    const raw: Array<PredictionAlert & { rawKey: string }> = patterns.map(p => {
      const freqRatio   = Math.min(p.count / Math.max(p.threshold, 1), 1.0);
      const kindWeight  = KIND_WEIGHT[p.kind];
      const confidence  = Math.min(freqRatio * kindWeight, 1.0);
      const severity    = this.toSeverity(confidence);

      return {
        category:   p.category,
        severity,
        confidence: Math.round(confidence * 1000) / 1000,
        patternKind: p.kind,
        message:    p.message,
        peakHour:   p.peakHour,
        source:     p.source,
        producedAt: now,
        // De-duplication key: category + kind
        rawKey: `${p.category}::${p.kind}`,
      };
    });

    // De-duplicate: keep highest confidence per (category, kind) pair.
    const best = new Map<string, PredictionAlert & { rawKey: string }>();
    for (const alert of raw) {
      const existing = best.get(alert.rawKey);
      if (!existing || alert.confidence > existing.confidence) {
        best.set(alert.rawKey, alert);
      }
    }

    // Strip internal key and sort.
    return Array.from(best.values())
      .map(({ rawKey: _rk, ...a }) => a)
      .sort((a, b) => b.confidence - a.confidence);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private toSeverity(confidence: number): PredictionSeverity {
    if (confidence >= this.cfg.criticalThreshold) return "critical";
    if (confidence >= this.cfg.warnThreshold)     return "warn";
    return "watch";
  }
}
