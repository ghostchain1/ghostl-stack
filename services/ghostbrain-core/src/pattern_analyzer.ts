/**
 * GhostBrain Core — Pattern Analyzer
 *
 * Aggregates pattern signals from pattern_memory and pattern_recognition
 * into a single analysis surface.
 *
 * Detects:
 *   • Recurring infrastructure tasks / container failures
 *   • Performance bottlenecks (CPU/mem trends > sustained threshold)
 *   • Abnormal system behaviour (divergence from baseline)
 *   • Temporal spike patterns (same-time-of-day failures)
 *
 * This module is a pure analysis layer — it never executes repairs.
 * All findings are returned as PatternAnalysis objects for the decision engine.
 */

import { detectPatterns }            from "./memory/pattern_memory.js";
import { detectRecurringPatterns }       from "./predictive/pattern_recognition.js";
import { getInfraHistory }            from "./memory/infrastructure_memory.js";
import { log }                        from "./observability/event_logger.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PatternSeverity = "info" | "warning" | "critical";

export interface PatternAnalysis {
  id:           string;             // deterministic key
  analysisType: "correlation" | "temporal" | "bottleneck" | "anomaly";
  severity:     PatternSeverity;
  resourceId:   string;
  description:  string;
  confidence:   number;             // 0–1
  recommendation: string;
  data:         Record<string, unknown>;
  detectedAt:   number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CPU_BOTTLENECK_PCT  = Number(process.env.PATTERN_CPU_THRESH  ?? "80");
const MEM_BOTTLENECK_PCT  = Number(process.env.PATTERN_MEM_THRESH  ?? "85");
const MIN_CONF            = Number(process.env.PATTERN_MIN_CONF    ?? "0.6");
const ANALYSIS_WINDOW_MS  = 10 * 60_000; // look at last 10 minutes of infra history

// ── State ─────────────────────────────────────────────────────────────────────

const _analyses: PatternAnalysis[] = [];
const MAX_CACHE = 500;

// ── Analysis functions ────────────────────────────────────────────────────────

/** Analyse correlation patterns (A → B pairs from pattern_memory). */
function analyzeCorrelations(): PatternAnalysis[] {
  const out: PatternAnalysis[] = [];
  const patterns = detectPatterns(20);
  for (const p of patterns) {
    if (p.confidence < MIN_CONF) continue;
    out.push({
      id:           `corr:${p.precursor}:${p.consequent}`,
      analysisType: "correlation",
      severity:     p.confidence >= 0.85 ? "critical" : p.confidence >= 0.7 ? "warning" : "info",
      resourceId:   "cluster",
      description:  `${p.precursor} → ${p.consequent} (seen ${p.count}× with ${(p.confidence * 100).toFixed(1)}% confidence, avg delay ${p.avgDelayMs.toFixed(0)} ms)`,
      confidence:   p.confidence,
      recommendation: `Pre-empt "${p.consequent}" when "${p.precursor}" is observed — avg ${p.avgDelayMs.toFixed(0)} ms before event.`,
      data:         { precursor: p.precursor, consequent: p.consequent, count: p.count, avgDelayMs: p.avgDelayMs },
      detectedAt:   Date.now(),
    });
  }
  return out;
}

/** Detect temporal / recurring patterns (same time-of-day failures). */
function analyzeTemporalPatterns(): PatternAnalysis[] {
  const out: PatternAnalysis[] = [];
  try {
    const recurring = detectRecurringPatterns();
    for (const rp of recurring) {
      out.push({
        id:           `temporal:${rp.resourceId}:${rp.metric}`,
        analysisType: "temporal",
        severity:     rp.confidence > 0.85 ? "critical" : "warning",
        resourceId:   rp.resourceId,
        description:  `Recurring ${rp.metric} spike on ${rp.resourceId} — peaks around ${hourLabel(rp.peakHour ?? 12)} UTC (seen ${rp.occurrences}×)`,
        confidence:   Math.min(rp.occurrences / 10, 0.95),
        recommendation: `Scale up or redistribute load on ${rp.resourceId} before ${hourLabel(rp.peakHour ?? 12)} UTC.`,
        data:         { metric: rp.metric, peakHour: rp.peakHour, description: rp.description, occurrences: rp.occurrences },
        detectedAt:   Date.now(),
      });
    }
  } catch {
    // pattern_recognition may not have enough data yet
  }
  return out;
}

/** Detect performance bottlenecks from infra history. */
function analyzeBottlenecks(): PatternAnalysis[] {
  const out: PatternAnalysis[] = [];
  const cutoff = Date.now() - ANALYSIS_WINDOW_MS;

  // getInfraHistory returns per-resource snapshots; analyse recent readings
  try {
    const history = getInfraHistory();
    // Group snapshots by resourceId
    const byResource = new Map<string, typeof history>();
    for (const snap of history) {
      const arr = byResource.get(snap.resourceId) ?? [];
      arr.push(snap);
      byResource.set(snap.resourceId, arr);
    }
    for (const [resourceId, snaps] of byResource) {
      const recent = snaps.filter(s => s.ts >= cutoff);
      if (recent.length < 3) continue;

      const avgCpu = average(recent.map(s => s.cpuPct));
      const avgMem = average(recent.map(s => s.memPct));

      if (avgCpu > CPU_BOTTLENECK_PCT) {
        out.push(makeBottleneck(resourceId, "cpu", avgCpu, CPU_BOTTLENECK_PCT));
      }
      if (avgMem > MEM_BOTTLENECK_PCT) {
        out.push(makeBottleneck(resourceId, "mem", avgMem, MEM_BOTTLENECK_PCT));
      }
    }
  } catch {
    // infra history may be empty in early boot
  }
  return out;
}

function makeBottleneck(resourceId: string, metric: string, avg: number, thresh: number): PatternAnalysis {
  return {
    id:           `bottleneck:${resourceId}:${metric}`,
    analysisType: "bottleneck",
    severity:     avg > thresh + 10 ? "critical" : "warning",
    resourceId,
    description:  `Sustained ${metric.toUpperCase()} ${avg.toFixed(1)}% on ${resourceId} (threshold: ${thresh}%)`,
    confidence:   Math.min((avg - thresh) / 20 + 0.5, 0.99),
    recommendation: `${metric === "cpu" ? "Rebalance workload or scale container CPU quota" : "Increase memory limit or shed non-critical tasks"} for ${resourceId}.`,
    data:         { metric, avg, threshold: thresh },
    detectedAt:   Date.now(),
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Run all pattern analysis passes and return aggregated findings. */
export function analyzePatterns(): PatternAnalysis[] {
  const findings = [
    ...analyzeCorrelations(),
    ...analyzeTemporalPatterns(),
    ...analyzeBottlenecks(),
  ];

  // Deduplicate by id (use highest confidence when duplicate)
  const deduped = new Map<string, PatternAnalysis>();
  for (const f of findings) {
    const existing = deduped.get(f.id);
    if (!existing || f.confidence > existing.confidence) deduped.set(f.id, f);
  }

  const result = [...deduped.values()].sort((a, b) => b.confidence - a.confidence);

  // Keep rolling cache
  _analyses.push(...result);
  if (_analyses.length > MAX_CACHE) _analyses.splice(0, _analyses.length - MAX_CACHE);

  log.debug("pattern_analyzer: analysis", `findings=${result.length}`);
  return result;
}

/** Return cached analyses without re-running. */
export function getCachedAnalyses(): PatternAnalysis[] {
  return _analyses.slice(-100);
}

/** Filter analyses by severity. */
export function getCriticalPatterns(): PatternAnalysis[] {
  return analyzePatterns().filter(a => a.severity === "critical");
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function average(nums: number[]): number {
  return nums.length === 0 ? 0 : nums.reduce((s, n) => s + n, 0) / nums.length;
}

function hourLabel(h: number): string {
  return `${String(h).padStart(2, "0")}:00`;
}
