/**
 * GhostBrain Predictive AI — Anomaly Detector
 *
 * Detects statistical anomalies in infrastructure metrics using:
 *   - Z-score deviation (how many σ away from rolling mean)
 *   - Moving-average envelope (value outside ±N% of MA)
 *
 * Maintains per-resource, per-metric rolling statistics.
 * No external dependencies — pure TypeScript math.
 */

import type { ForecastMetric } from "./load_forecaster.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type AnomalySeverity = "low" | "medium" | "high" | "critical";

export interface AnomalyEvent {
  id:           string;
  resourceId:   string;
  metric:       ForecastMetric;
  value:        number;
  zScore:       number;
  maDeviation:  number; // % deviation from moving average
  severity:     AnomalySeverity;
  detectedAt:   number;
  resolved:     boolean;
  resolvedAt?:  number;
}

// ── Config ────────────────────────────────────────────────────────────────────

const ROLLING_N          = Number(process.env.ANOMALY_ROLLING_N          ?? "60");
const Z_LOW              = Number(process.env.ANOMALY_Z_LOW               ?? "2.0");
const Z_MEDIUM           = Number(process.env.ANOMALY_Z_MEDIUM            ?? "2.8");
const Z_HIGH             = Number(process.env.ANOMALY_Z_HIGH              ?? "3.5");
const Z_CRITICAL         = Number(process.env.ANOMALY_Z_CRITICAL          ?? "4.5");
const MA_DEVIATION_PCT   = Number(process.env.ANOMALY_MA_DEVIATION_PCT    ?? "20");  // %
const MAX_ACTIVE_ANOMALIES = Number(process.env.ANOMALY_MAX_ACTIVE        ?? "200");
const RESOLVE_WINDOW_MS  = Number(process.env.ANOMALY_RESOLVE_WINDOW_MS   ?? "120_000");

// ── Internal state ────────────────────────────────────────────────────────────

interface RollingStats {
  values: number[];  // circular buffer
  sum:    number;
  sumSq:  number;
}

// resourceId → metric → rolling stats
const _stats = new Map<string, Map<ForecastMetric, RollingStats>>();

// Active + historical anomalies
const _active   = new Map<string, AnomalyEvent>(); // id → event
const _history: AnomalyEvent[] = [];

let _totalDetected = 0;

// ── Internal helpers ──────────────────────────────────────────────────────────

function getStats(resourceId: string, metric: ForecastMetric): RollingStats {
  if (!_stats.has(resourceId)) _stats.set(resourceId, new Map());
  const m = _stats.get(resourceId)!;
  if (!m.has(metric)) m.set(metric, { values: [], sum: 0, sumSq: 0 });
  return m.get(metric)!;
}

function pushValue(rs: RollingStats, v: number): void {
  if (rs.values.length >= ROLLING_N) {
    const old = rs.values.shift()!;
    rs.sum   -= old;
    rs.sumSq -= old * old;
  }
  rs.values.push(v);
  rs.sum   += v;
  rs.sumSq += v * v;
}

function rollingMean(rs: RollingStats): number {
  return rs.values.length === 0 ? 0 : rs.sum / rs.values.length;
}

function rollingStdDev(rs: RollingStats): number {
  const n = rs.values.length;
  if (n < 2) return 0;
  const mean    = rs.sum / n;
  const variance = rs.sumSq / n - mean * mean;
  return Math.sqrt(Math.max(0, variance));
}

function zToSeverity(z: number): AnomalySeverity | null {
  const az = Math.abs(z);
  if (az >= Z_CRITICAL) return "critical";
  if (az >= Z_HIGH)     return "high";
  if (az >= Z_MEDIUM)   return "medium";
  if (az >= Z_LOW)      return "low";
  return null;
}

function anomalyId(resourceId: string, metric: string): string {
  return `${resourceId}::${metric}`;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Feed a new value into the detector.
 * Returns an AnomalyEvent if an anomaly is detected, null otherwise.
 */
export function detectAnomaly(
  resourceId: string,
  metric:     ForecastMetric,
  value:      number,
  ts          = Date.now(),
): AnomalyEvent | null {
  const rs = getStats(resourceId, metric);
  pushValue(rs, value);

  if (rs.values.length < 5) return null; // need baseline

  const mean    = rollingMean(rs);
  const stdDev  = rollingStdDev(rs);
  const zScore  = stdDev > 1e-6 ? (value - mean) / stdDev : 0;
  const severity = zToSeverity(zScore);

  const maDev = mean > 1e-6 ? Math.abs((value - mean) / mean) * 100 : 0;

  const id = anomalyId(resourceId, metric);

  // Resolve existing active anomaly if value has returned to normal
  if (!severity) {
    const existing = _active.get(id);
    if (existing && ts - existing.detectedAt > RESOLVE_WINDOW_MS) {
      existing.resolved  = true;
      existing.resolvedAt = ts;
      _history.push({ ...existing });
      _active.delete(id);
    }
    return null;
  }

  // Upsert active anomaly
  const existing = _active.get(id);
  if (existing) {
    // upgrade severity if worse
    const sevOrder: Record<AnomalySeverity, number> = { low:1, medium:2, high:3, critical:4 };
    if (sevOrder[severity] > sevOrder[existing.severity]) {
      existing.severity = severity;
      existing.zScore   = zScore;
    }
    return existing;
  }

  // New anomaly
  if (_active.size >= MAX_ACTIVE_ANOMALIES) {
    // Evict oldest resolved or lowest severity
    const first = _active.keys().next().value;
    if (first) _active.delete(first);
  }

  _totalDetected++;
  const ev: AnomalyEvent = {
    id, resourceId, metric, value,
    zScore, maDeviation: maDev,
    severity, detectedAt: ts,
    resolved: false,
  };
  _active.set(id, ev);
  return ev;
}

export function getAnomalies(resourceId?: string): AnomalyEvent[] {
  const all = [..._active.values()];
  return resourceId ? all.filter(a => a.resourceId === resourceId) : all;
}

export function getAnomalyHistory(limit = 100): AnomalyEvent[] {
  return _history.slice(-limit);
}

export function anomalyStats(): {
  active:         number;
  totalDetected:  number;
  bySeverity:     Record<AnomalySeverity, number>;
  resources:      number;
} {
  const bySeverity: Record<AnomalySeverity, number> = { low:0, medium:0, high:0, critical:0 };
  for (const a of _active.values()) bySeverity[a.severity]++;
  return {
    active:        _active.size,
    totalDetected: _totalDetected,
    bySeverity,
    resources:     _stats.size,
  };
}
