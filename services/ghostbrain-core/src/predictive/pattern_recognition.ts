/**
 * GhostBrain Predictive AI — Pattern Recognition
 *
 * Learns **temporal** and **correlative** patterns from infrastructure metrics:
 *
 *   Temporal  — periodic spikes (every ~N minutes, time-of-day)
 *   Correlative — when resource A spikes, resource B follows
 *
 * Algorithms:
 *   - Autocorrelation on rolling metric windows (periodicity detection)
 *   - Sliding-bucket histogram for time-of-day profiling
 *   - Pearson correlation between resource pairs
 *
 * Complement to memory/pattern_memory.ts (event co-occurrence) — this module
 * operates on raw numeric time-series, not discrete events.
 */

import type { ForecastMetric } from "./load_forecaster.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PatternKind = "periodic" | "correlated" | "tod_spike";

export interface RecurringPattern {
  id:           string;
  kind:         PatternKind;
  resourceId:   string;
  metric:       ForecastMetric;
  description:  string;
  // periodic-specific
  periodMs?:    number;
  // correlated-specific
  peerResourceId?: string;
  peerMetric?:     ForecastMetric;
  correlationR?:   number;       // Pearson -1..1
  // tod-specific
  peakHour?:        number;      // 0–23 UTC
  // general
  confidence:   number;          // 0–1
  firstSeenAt:  number;
  lastSeenAt:   number;
  occurrences:  number;
}

// ── Config ────────────────────────────────────────────────────────────────────

const SAMPLE_BUFFER        = Number(process.env.PATTERN_SAMPLE_BUFFER     ?? "120");
const MIN_AUTOCORR_CONF    = Number(process.env.PATTERN_MIN_AUTOCORR      ?? "0.5");
const MIN_CORR_R           = Number(process.env.PATTERN_MIN_PEARSON_R     ?? "0.7");
const TOD_BUCKETS          = 24; // one per UTC hour
const TOD_SPIKE_Z          = Number(process.env.PATTERN_TOD_SPIKE_Z       ?? "1.5");

// ── Internal state ────────────────────────────────────────────────────────────

// resourceId → metric → time-stamped value buffer
const _series = new Map<string, Map<ForecastMetric, { v: number; ts: number }[]>>();

// Time-of-day histogram: resourceId → metric → 24-bucket mean accumulators
const _todBuckets = new Map<string, Map<ForecastMetric, { sum: number; count: number }[]>>();

// Discovered patterns
const _patterns = new Map<string, RecurringPattern>();

let _scanCount = 0;

// ── Helpers ───────────────────────────────────────────────────────────────────

function getSeries(rid: string, m: ForecastMetric) {
  if (!_series.has(rid)) _series.set(rid, new Map());
  const rm = _series.get(rid)!;
  if (!rm.has(m)) rm.set(m, []);
  return rm.get(m)!;
}

function getTodBuckets(rid: string, m: ForecastMetric) {
  if (!_todBuckets.has(rid)) _todBuckets.set(rid, new Map());
  const rm = _todBuckets.get(rid)!;
  if (!rm.has(m)) {
    rm.set(m, Array.from({ length: TOD_BUCKETS }, () => ({ sum: 0, count: 0 })));
  }
  return rm.get(m)!;
}

function pearson(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return 0;
  let sx=0, sy=0, sxx=0, syy=0, sxy=0;
  for (let i=0; i<n; i++) {
    sx += xs[i]; sy += ys[i];
    sxx += xs[i]**2; syy += ys[i]**2;
    sxy += xs[i]*ys[i];
  }
  const mx=sx/n, my=sy/n;
  const dx=sxx/n-mx*mx, dy=syy/n-my*my;
  if (dx < 1e-10 || dy < 1e-10) return 0;
  return (sxy/n - mx*my) / Math.sqrt(dx*dy);
}

function autocorrelation(vals: number[], lag: number): number {
  const n = vals.length - lag;
  if (n < 3) return 0;
  const a = vals.slice(0, n);
  const b = vals.slice(lag, lag+n);
  return pearson(a, b);
}

function upsertPattern(p: RecurringPattern): void {
  const existing = _patterns.get(p.id);
  if (existing) {
    existing.occurrences++;
    existing.lastSeenAt = Date.now();
    existing.confidence = Math.min(1, existing.confidence * 0.9 + p.confidence * 0.1);
  } else {
    _patterns.set(p.id, p);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Record a new metric sample.  Call every collect cycle.
 */
export function recordMetricSample(
  resourceId: string,
  metric:     ForecastMetric,
  value:      number,
  ts          = Date.now(),
): void {
  const buf = getSeries(resourceId, metric);
  buf.push({ v: value, ts });
  if (buf.length > SAMPLE_BUFFER) buf.shift();

  // time-of-day bucket
  const hour = new Date(ts).getUTCHours();
  const bkts = getTodBuckets(resourceId, metric);
  bkts[hour].sum   += value;
  bkts[hour].count += 1;
}

/**
 * Run pattern analysis across all tracked resources.  Call on every brain tick.
 */
export function detectRecurringPatterns(): RecurringPattern[] {
  _scanCount++;
  const now = Date.now();
  const newlyFound: RecurringPattern[] = [];

  for (const [rid, metricMap] of _series) {
    for (const [metric, buf] of metricMap) {
      if (buf.length < 20) continue;
      const vals = buf.map(b => b.v);

      // ── Periodicity via autocorrelation at candidate lags ─────────────────
      const candidateLags = [3, 4, 6, 10, 12, 15, 20]; // in samples
      for (const lag of candidateLags) {
        if (lag >= vals.length / 2) continue;
        const r = autocorrelation(vals, lag);
        if (r >= MIN_AUTOCORR_CONF) {
          const avgIntervalMs = lag > 0 ? (buf[lag].ts - buf[0].ts) / lag : 0;
          if (avgIntervalMs < 1000) continue;
          const id = `periodic::${rid}::${metric}::${lag}`;
          const p: RecurringPattern = {
            id, kind: "periodic",
            resourceId: rid, metric,
            description: `Periodic ${metric} pattern every ~${Math.round(avgIntervalMs/1000)}s on ${rid}`,
            periodMs: avgIntervalMs,
            confidence: r,
            firstSeenAt: buf[0].ts,
            lastSeenAt: now,
            occurrences: 1,
          };
          upsertPattern(p);
          newlyFound.push(p);
        }
      }

      // ── Time-of-day spike detection ───────────────────────────────────────
      const bkts = getTodBuckets(rid, metric);
      const hourMeans = bkts.map(b => b.count > 0 ? b.sum / b.count : 0);
      const overallMean = hourMeans.reduce((a, b) => a + b, 0) / TOD_BUCKETS;
      const overallStd  = Math.sqrt(
        hourMeans.reduce((a, b) => a + (b - overallMean)**2, 0) / TOD_BUCKETS
      );
      for (let h = 0; h < TOD_BUCKETS; h++) {
        if (bkts[h].count < 3) continue;
        const z = overallStd > 1e-6 ? (hourMeans[h] - overallMean) / overallStd : 0;
        if (z >= TOD_SPIKE_Z) {
          const id = `tod::${rid}::${metric}::${h}`;
          upsertPattern({
            id, kind: "tod_spike",
            resourceId: rid, metric,
            description: `Time-of-day ${metric} spike at UTC ${h}:00 on ${rid}`,
            peakHour: h,
            confidence: Math.min(1, z / 4),
            firstSeenAt: now,
            lastSeenAt: now,
            occurrences: 1,
          });
        }
      }
    }

    // ── Cross-resource correlation (for all tracked metric pairs) ─────────
    const ridKeys = [..._series.keys()];
    for (const otherRid of ridKeys) {
      if (otherRid === rid) continue;
      const otherMap = _series.get(otherRid)!;
      for (const [metric, buf] of metricMap) {
        if (!otherMap.has(metric)) continue;
        const otherBuf = otherMap.get(metric)!;
        const n = Math.min(buf.length, otherBuf.length, 30);
        if (n < 5) continue;
        const xs = buf.slice(-n).map(b => b.v);
        const ys = otherBuf.slice(-n).map(b => b.v);
        const r  = pearson(xs, ys);
        if (Math.abs(r) >= MIN_CORR_R) {
          const id = `corr::${rid}::${metric}::${otherRid}`;
          upsertPattern({
            id, kind: "correlated",
            resourceId: rid, metric,
            description: `${metric} on ${rid} correlates with ${metric} on ${otherRid} (r=${r.toFixed(2)})`,
            peerResourceId: otherRid, peerMetric: metric,
            correlationR: r,
            confidence: Math.abs(r),
            firstSeenAt: now,
            lastSeenAt: now,
            occurrences: 1,
          });
        }
      }
    }
  }

  return newlyFound;
}

export function getPatterns(kind?: PatternKind): RecurringPattern[] {
  const all = [..._patterns.values()];
  return kind ? all.filter(p => p.kind === kind) : all;
}

export function patternRecognitionStats(): {
  patterns:   number;
  scanCount:  number;
  resources:  number;
  byKind:     Record<PatternKind, number>;
} {
  const byKind: Record<PatternKind, number> = { periodic: 0, correlated: 0, tod_spike: 0 };
  for (const p of _patterns.values()) byKind[p.kind]++;
  return { patterns: _patterns.size, scanCount: _scanCount, resources: _series.size, byKind };
}
