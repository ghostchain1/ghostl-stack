/**
 * GhostBrain Predictive AI — Predictive Balancer
 *
 * Consumes load forecasts and decides which workloads to move,
 * throttle, or scale — BEFORE resources become overloaded.
 *
 * Decision logic uses a simple scoring system:
 *   1. Score all candidate target hosts (from load_forecaster data)
 *   2. For each overloaded source, pick the lightest available target
 *   3. Emit MigrationRecommendation records
 *
 * Actions are enqueued via resource_scheduler — no direct execution here.
 */

import type { LoadForecast }   from "./load_forecaster.js";
import type { AnomalyEvent }  from "./anomaly_detector.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type BalancerAction = "migrate" | "scale_up" | "throttle" | "alert";

export interface MigrationRecommendation {
  id:              string;
  sourceResourceId: string;
  targetResourceId: string | null;  // null = alert only
  action:          BalancerAction;
  reason:          string;
  urgencyScore:    number;           // 0–100
  createdAt:       number;
  executed:        boolean;
  executedAt?:     number;
}

// ── Config ────────────────────────────────────────────────────────────────────

const OVERLOAD_CPU_PCT   = Number(process.env.BALANCER_OVERLOAD_CPU   ?? "80");
const OVERLOAD_MEM_PCT   = Number(process.env.BALANCER_OVERLOAD_MEM   ?? "85");
const OVERLOAD_DISK_PCT  = Number(process.env.BALANCER_OVERLOAD_DISK  ?? "80");
const HEADROOM_REQUIRED  = Number(process.env.BALANCER_HEADROOM       ?? "20"); // % free
const MAX_RECS_PER_TICK  = Number(process.env.BALANCER_MAX_RECS       ?? "5");
const REC_EXPIRY_MS      = Number(process.env.BALANCER_REC_EXPIRY_MS  ?? "300_000"); // 5 min

// ── Internal state ────────────────────────────────────────────────────────────

// resourceId → latest set of forecasts
const _forecastsByResource = new Map<string, LoadForecast[]>();

const _recommendations: MigrationRecommendation[] = [];
let _totalRecsEver = 0;

// ── Helpers ───────────────────────────────────────────────────────────────────

function forecastedValueAt(forecasts: LoadForecast[], metric: string, horizonMs: number): number | null {
  const hit = forecasts.find(f => f.metric === metric && f.horizonMs === horizonMs);
  return hit?.predictedValue ?? null;
}

function resourceLoadScore(forecasts: LoadForecast[], horizonMs: number): number {
  const cpu  = forecastedValueAt(forecasts, "cpu",  horizonMs) ?? 0;
  const mem  = forecastedValueAt(forecasts, "mem",  horizonMs) ?? 0;
  const disk = forecastedValueAt(forecasts, "disk", horizonMs) ?? 0;
  return cpu * 0.45 + mem * 0.40 + disk * 0.15;
}

function isOverloaded(forecasts: LoadForecast[], horizonMs: number): { overloaded: boolean; reason: string } {
  const cpu  = forecastedValueAt(forecasts, "cpu",  horizonMs);
  const mem  = forecastedValueAt(forecasts, "mem",  horizonMs);
  const disk = forecastedValueAt(forecasts, "disk", horizonMs);
  const parts: string[] = [];
  if (cpu  !== null && cpu  >= OVERLOAD_CPU_PCT)  parts.push(`cpu=${cpu.toFixed(0)}%`);
  if (mem  !== null && mem  >= OVERLOAD_MEM_PCT)  parts.push(`mem=${mem.toFixed(0)}%`);
  if (disk !== null && disk >= OVERLOAD_DISK_PCT) parts.push(`disk=${disk.toFixed(0)}%`);
  return { overloaded: parts.length > 0, reason: parts.join(", ") };
}

function hasSufficientHeadroom(forecasts: LoadForecast[], horizonMs: number): boolean {
  const score = resourceLoadScore(forecasts, horizonMs);
  return score + HEADROOM_REQUIRED <= 100;
}

let _recSeq = 0;
function nextId(): string { return `prec-${Date.now()}-${++_recSeq}`; }

function pruneExpired(): void {
  const cutoff = Date.now() - REC_EXPIRY_MS;
  const len = _recommendations.length;
  let i = 0;
  while (i < _recommendations.length) {
    if (_recommendations[i].executed || _recommendations[i].createdAt < cutoff) {
      _recommendations.splice(i, 1);
    } else { i++; }
  }
  return;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Update the forecaster view for a resource.  Called by the brain tick.
 */
export function updateForecasts(resourceId: string, forecasts: LoadForecast[]): void {
  _forecastsByResource.set(resourceId, forecasts);
}

/**
 * Analyse all known resources and emit migration / action recommendations.
 * Returns new recommendations generated this call.
 */
export function analyzeAndRecommend(
  anomalies: AnomalyEvent[] = [],
): MigrationRecommendation[] {
  pruneExpired();
  const created: MigrationRecommendation[] = [];
  const now = Date.now();

  const resources = [..._forecastsByResource.entries()];

  for (const [sourceId, fcs] of resources) {
    if (created.length >= MAX_RECS_PER_TICK) break;

    // Skip if already has a pending (non-executed) recommendation
    const alreadyPending = _recommendations.some(
      r => r.sourceResourceId === sourceId && !r.executed,
    );
    if (alreadyPending) continue;

    // Evaluate at 30s, 60s, 120s horizons — shortest triggering one wins
    for (const horizon of [30_000, 60_000, 120_000]) {
      const { overloaded, reason } = isOverloaded(fcs, horizon);
      if (!overloaded) continue;

      const overloadScore = resourceLoadScore(fcs, horizon);
      const urgency = Math.min(100, overloadScore);

      // Find best migration target (has enough headroom at same horizon)
      let bestTarget: string | null = null;
      let bestScore = Infinity;
      for (const [targetId, targetFcs] of resources) {
        if (targetId === sourceId) continue;
        if (!hasSufficientHeadroom(targetFcs, horizon)) continue;
        const score = resourceLoadScore(targetFcs, horizon);
        if (score < bestScore) { bestScore = score; bestTarget = targetId; }
      }

      // Check if anomaly on this resource amplifies urgency
      const activeAnomaly = anomalies.find(a => a.resourceId === sourceId);
      const action: BalancerAction = bestTarget
        ? (horizon <= 30_000 ? "migrate" : "scale_up")
        : (overloadScore > 90 ? "throttle" : "alert");

      const rec: MigrationRecommendation = {
        id:               nextId(),
        sourceResourceId: sourceId,
        targetResourceId: bestTarget,
        action,
        reason:           `Predicted overload in ${horizon/1000}s (${reason})${activeAnomaly ? ` + anomaly:${activeAnomaly.severity}` : ""}`,
        urgencyScore:     urgency,
        createdAt:        now,
        executed:         false,
      };

      _recommendations.push(rec);
      _totalRecsEver++;
      created.push(rec);
      break; // one rec per source per tick
    }
  }

  return created;
}

export function markExecuted(id: string): void {
  const rec = _recommendations.find(r => r.id === id);
  if (rec) { rec.executed = true; rec.executedAt = Date.now(); }
}

export function getRecommendations(onlyPending = false): MigrationRecommendation[] {
  return onlyPending
    ? _recommendations.filter(r => !r.executed)
    : [..._recommendations];
}

export function predictiveBalancerStats(): {
  trackedResources:  number;
  pendingRecs:       number;
  totalRecsEver:     number;
} {
  return {
    trackedResources:  _forecastsByResource.size,
    pendingRecs:       _recommendations.filter(r => !r.executed).length,
    totalRecsEver:     _totalRecsEver,
  };
}
