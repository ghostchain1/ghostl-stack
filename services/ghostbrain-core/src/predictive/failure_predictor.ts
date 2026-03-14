/**
 * GhostBrain Predictive AI — Failure Predictor
 *
 * Produces multi-horizon (30 s / 60 s / 120 s) failure risk scores by
 * combining:
 *   - Load forecasts (trend toward critical thresholds)
 *   - Active anomalies (current statistical deviation)
 *   - Temporal pattern hits (known repeating failure times)
 *
 * Scoring model (all factors summed, capped at 1.0):
 *
 *   trend_score  = how close the forecasted peak gets to the danger threshold
 *   anomaly_score = severity of any active anomaly on the resource
 *   pattern_score = pattern confidence if a known spike pattern is active now
 *
 * Combined: score = min(1, 0.5*trend + 0.3*anomaly + 0.2*pattern)
 */

import type { LoadForecast }      from "./load_forecaster.js";
import type { AnomalyEvent, AnomalySeverity } from "./anomaly_detector.js";
import type { RecurringPattern }  from "./pattern_recognition.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type FailureRisk = "safe" | "low" | "elevated" | "high" | "imminent";

export interface FailurePrediction {
  resourceId:    string;
  horizonMs:     number;      // 30 000 / 60 000 / 120 000
  score:         number;      // 0–1
  risk:          FailureRisk;
  factors:       {
    trend:       number;
    anomaly:     number;
    pattern:     number;
  };
  topMetric:     string;      // metric driving the highest trend score
  predictedAt:   number;
}

// ── Config ────────────────────────────────────────────────────────────────────

const DANGER_CPU    = Number(process.env.FAILURE_DANGER_CPU   ?? "90");
const DANGER_MEM    = Number(process.env.FAILURE_DANGER_MEM   ?? "92");
const DANGER_DISK   = Number(process.env.FAILURE_DANGER_DISK  ?? "85");
const HORIZONS      = [30_000, 60_000, 120_000];

// ── Internal state ────────────────────────────────────────────────────────────

const _activeRisks = new Map<string, FailurePrediction[]>(); // resourceId → predictions
let _totalPredictions = 0;

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoreToRisk(score: number): FailureRisk {
  if (score >= 0.85) return "imminent";
  if (score >= 0.65) return "high";
  if (score >= 0.40) return "elevated";
  if (score >= 0.20) return "low";
  return "safe";
}

const DANGER_MAP: Record<string, number> = {
  cpu:  DANGER_CPU,
  mem:  DANGER_MEM,
  disk: DANGER_DISK,
  net:  100, // net rarely has a fixed danger threshold
};

function trendScore(forecasts: LoadForecast[], horizonMs: number): { score: number; topMetric: string } {
  let best = 0;
  let topMetric = "cpu";
  for (const f of forecasts) {
    if (f.horizonMs !== horizonMs) continue;
    if (f.trend !== "rising") continue;
    const danger = DANGER_MAP[f.metric] ?? 100;
    const proximity = Math.max(0, f.predictedValue - danger * 0.6) / (danger * 0.4);
    const s = Math.min(1, proximity) * f.confidence;
    if (s > best) { best = s; topMetric = f.metric; }
  }
  return { score: best, topMetric };
}

const SEV_SCORE: Record<AnomalySeverity, number> = {
  low: 0.15, medium: 0.35, high: 0.65, critical: 0.90,
};

function anomalyScore(anomalies: AnomalyEvent[], resourceId: string): number {
  const hits = anomalies.filter(a => a.resourceId === resourceId);
  if (hits.length === 0) return 0;
  return Math.min(1, hits.reduce((acc, a) => acc + SEV_SCORE[a.severity], 0));
}

function patternScore(patterns: RecurringPattern[], resourceId: string, now: number): number {
  // tod_spike: check if current UTC hour matches peak hour
  const hour = new Date(now).getUTCHours();
  const hits = patterns.filter(p => {
    if (p.resourceId !== resourceId) return false;
    if (p.kind === "tod_spike" && p.peakHour === hour) return true;
    return false;
  });
  if (hits.length === 0) return 0;
  return Math.min(1, hits.reduce((acc, p) => acc + (p.confidence ?? 0), 0));
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run failure prediction for a single resource.
 * Returns one FailurePrediction per horizon.
 */
export function predictFailures(
  resourceId: string,
  forecasts:  LoadForecast[],
  anomalies:  AnomalyEvent[],
  patterns:   RecurringPattern[],
  now         = Date.now(),
): FailurePrediction[] {
  const result: FailurePrediction[] = [];

  for (const horizonMs of HORIZONS) {
    const { score: ts, topMetric } = trendScore(forecasts, horizonMs);
    const as = anomalyScore(anomalies, resourceId);
    const ps = patternScore(patterns, resourceId, now);

    const score = Math.min(1, 0.50 * ts + 0.30 * as + 0.20 * ps);
    _totalPredictions++;

    result.push({
      resourceId,
      horizonMs,
      score,
      risk:        scoreToRisk(score),
      factors:     { trend: ts, anomaly: as, pattern: ps },
      topMetric,
      predictedAt: now,
    });
  }

  _activeRisks.set(resourceId, result);
  return result;
}

export function getActiveRisks(minRisk: FailureRisk = "low"): FailurePrediction[] {
  const riskOrder: Record<FailureRisk, number> = { safe:0, low:1, elevated:2, high:3, imminent:4 };
  const threshold = riskOrder[minRisk];
  return [..._activeRisks.values()]
    .flat()
    .filter(p => riskOrder[p.risk] >= threshold);
}

export function getRisksForResource(resourceId: string): FailurePrediction[] {
  return _activeRisks.get(resourceId) ?? [];
}

export function failurePredictorStats(): {
  resourcesTracked:  number;
  totalPredictions:  number;
  highRiskNow:       number;
  imminentNow:       number;
} {
  const all = [..._activeRisks.values()].flat();
  return {
    resourcesTracked: _activeRisks.size,
    totalPredictions: _totalPredictions,
    highRiskNow:      all.filter(p => p.risk === "high" || p.risk === "imminent").length,
    imminentNow:      all.filter(p => p.risk === "imminent").length,
  };
}
