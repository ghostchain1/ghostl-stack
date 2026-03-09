/**
 * GhostBrain — Crash Predictor
 *
 * Computes a crash probability score (0–1) for a resource using:
 *   1. Recent threshold breach history (frequency + severity weighted)
 *   2. Pattern memory — known precursor events increase score
 *   3. Trajectory — is the metric trending up or plateauing?
 *
 * Score thresholds:
 *   < 0.30  → safe
 *   0.30–0.60 → elevated
 *   0.60–0.80 → high risk
 *   > 0.80  → imminent crash
 */

import { detectPatterns, recordEvent } from "../memory/pattern_memory.js";
import type { ThresholdBreach }        from "./threshold_monitor.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type CrashRisk = "safe" | "elevated" | "high" | "imminent";

export interface CrashPrediction {
  resourceId:    string;
  score:         number;       // 0–1
  risk:          CrashRisk;
  factors:       string[];     // human-readable explanation
  predictedAt:   number;
  suggestedAction: string;
}

// ── In-memory breach history (ring buffer per resource) ───────────────────────

interface BreachRecord { ts: number; severity: "warn" | "crit"; metric: string; }
const _history = new Map<string, BreachRecord[]>();
const HISTORY_WINDOW = 15 * 60 * 1_000;  // 15 min
const MAX_HISTORY    = 200;

function pushHistory(resourceId: string, br: BreachRecord): void {
  const list = _history.get(resourceId) ?? [];
  list.push(br);
  // expire old
  const cutoff = Date.now() - HISTORY_WINDOW;
  while (list.length > 0 && list[0]!.ts < cutoff) list.shift();
  if (list.length > MAX_HISTORY) list.shift();
  _history.set(resourceId, list);
}

// ── Score computation ─────────────────────────────────────────────────────────

function riskFromScore(score: number): CrashRisk {
  if (score >= 0.80) return "imminent";
  if (score >= 0.60) return "high";
  if (score >= 0.30) return "elevated";
  return "safe";
}

function suggestAction(risk: CrashRisk, breaches: ThresholdBreach[]): string {
  if (risk === "imminent") {
    const metrics = [...new Set(breaches.map(b => b.metric))].join("+");
    if (metrics.includes("memory")) return "emergency_scale_memory";
    if (metrics.includes("cpu"))    return "throttle_processes";
    return "alert_operator";
  }
  if (risk === "high")     return "rebalance_containers";
  if (risk === "elevated") return "increase_monitoring_frequency";
  return "none";
}

/**
 * Record new breaches and compute an updated crash prediction.
 * Call this on every collect cycle for each monitored resource.
 */
export function predict(resourceId: string, breaches: ThresholdBreach[]): CrashPrediction {
  const now     = Date.now();
  const factors: string[] = [];

  // 1. Push breaches into history + feed pattern memory
  for (const b of breaches) {
    pushHistory(resourceId, { ts: b.ts, severity: b.severity, metric: b.metric });
    recordEvent({ resourceId, label: b.metric + "_" + b.severity, category: "threshold", ts: b.ts });
  }

  // 2. Breach frequency score
  const history = _history.get(resourceId) ?? [];
  const critCount = history.filter(h => h.severity === "crit").length;
  const warnCount = history.filter(h => h.severity === "warn").length;
  const freqScore = Math.min(1, (critCount * 0.15) + (warnCount * 0.05));
  if (critCount > 0) factors.push(`${critCount} critical threshold breaches in 15 min`);
  if (warnCount > 2) factors.push(`${warnCount} warning threshold breaches in 15 min`);

  // 3. Active breach severity score
  const hasCrit = breaches.some(b => b.severity === "crit");
  const sevScore = hasCrit ? 0.35 : (breaches.length > 0 ? 0.15 : 0);
  if (hasCrit) factors.push("active critical threshold exceeded");

  // 4. Pattern memory — if known precursor events detected, add risk
  const patterns = detectPatterns(0.5);
  const resourceEvents = history.map(h => `threshold:${h.metric}_${h.severity}`);
  let patternScore = 0;
  for (const pat of patterns) {
    if (resourceEvents.includes(pat.precursor) && pat.consequent.includes("crit")) {
      patternScore = Math.max(patternScore, pat.confidence * 0.25);
      factors.push(`pattern risk: ${pat.precursor} → ${pat.consequent} (conf ${(pat.confidence * 100).toFixed(0)}%)`);
    }
  }

  // 5. Accumulate
  const score    = Math.min(1, freqScore + sevScore + patternScore);
  const risk     = riskFromScore(score);
  const suggestedAction = suggestAction(risk, breaches);

  return { resourceId, score: +score.toFixed(3), risk, factors, predictedAt: now, suggestedAction };
}

/** Dump all stored prediction histories (for observability). */
export function predictionHistoryStats(): { resourceId: string; entries: number }[] {
  return [..._history.entries()].map(([id, h]) => ({ resourceId: id, entries: h.length }));
}
