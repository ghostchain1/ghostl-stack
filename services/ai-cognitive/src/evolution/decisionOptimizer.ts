/**
 * GCL — Decision Optimizer
 * Scores historical decision patterns and emits confidence levels
 * for proposed future decisions based on observed outcomes.
 */

import type { MemoryEntry } from "../memory/longTermMemory";

export type DecisionConfidenceLevel = "high" | "medium" | "low" | "insufficient-data";

export interface ScoredDecision {
  action:          string;     // normalized action label
  domain:          string;
  confidenceLevel: DecisionConfidenceLevel;
  avgSuccessScore: number;
  sampleSize:      number;
  recommendation:  string;
}

// ── Normalize ─────────────────────────────────────────────────────────────────

/** Lowercased, verbs only — strips object details for generalization */
function normalizeAction(action: string): string {
  return action
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .split(" ")
    .slice(0, 4)
    .join("-");
}

// ── Analysis ──────────────────────────────────────────────────────────────────

function levelFromScore(score: number, sampleSize: number): DecisionConfidenceLevel {
  if (sampleSize < 3)   return "insufficient-data";
  if (score >= 0.80)    return "high";
  if (score >= 0.55)    return "medium";
  return "low";
}

export function buildDecisionMap(memory: MemoryEntry[]): ScoredDecision[] {
  const grouped: Record<string, { entries: MemoryEntry[]; domain: string }> = {};

  for (const m of memory) {
    const key = normalizeAction(m.action);
    if (!grouped[key]) grouped[key] = { entries: [], domain: m.domain };
    grouped[key].entries.push(m);
  }

  const results: ScoredDecision[] = [];

  for (const [action, { entries, domain }] of Object.entries(grouped)) {
    const avgScore    = entries.reduce((s, e) => s + e.successScore, 0) / entries.length;
    const level       = levelFromScore(avgScore, entries.length);
    const successCount = entries.filter(e => e.success).length;

    let recommendation: string;
    switch (level) {
      case "high":
        recommendation = `Proven pattern (${successCount}/${entries.length} hits). Proceed with confidence.`;
        break;
      case "medium":
        recommendation = `Mixed results (${successCount}/${entries.length}). Apply monitoring.`;
        break;
      case "low":
        recommendation = `Low success rate. Consider alternative approach.`;
        break;
      default:
        recommendation = `Insufficient historical data. Proceed with caution.`;
    }

    results.push({
      action,
      domain,
      confidenceLevel: level,
      avgSuccessScore:  Math.round(avgScore * 100) / 100,
      sampleSize:       entries.length,
      recommendation,
    });
  }

  return results.sort((a, b) => b.avgSuccessScore - a.avgSuccessScore);
}

export function optimizeDecision(
  proposedAction: string,
  proposedDomain: string,
  memory:         MemoryEntry[],
): ScoredDecision {
  const key     = normalizeAction(proposedAction);
  const similar = memory.filter(m => normalizeAction(m.action).startsWith(key.slice(0, 6)));

  if (similar.length < 3) {
    return {
      action:          key,
      domain:          proposedDomain,
      confidenceLevel: "insufficient-data",
      avgSuccessScore: 0,
      sampleSize:      similar.length,
      recommendation:  `Less than 3 similar decisions in history. Gather more data before committing.`,
    };
  }

  const avgScore   = similar.reduce((s, e) => s + e.successScore, 0) / similar.length;
  const level      = levelFromScore(avgScore, similar.length);
  const successCt  = similar.filter(e => e.success).length;

  return {
    action:          key,
    domain:          proposedDomain,
    confidenceLevel: level,
    avgSuccessScore: Math.round(avgScore * 100) / 100,
    sampleSize:      similar.length,
    recommendation:  level === "high"
      ? `High confidence — ${successCt}/${similar.length} similar decisions succeeded.`
      : level === "medium"
      ? `Moderate confidence — monitor outcomes closely.`
      : `Low confidence — consider alternative or staged approach.`,
  };
}

// ── Cache ─────────────────────────────────────────────────────────────────────

let _cache: ScoredDecision[] = [];

export function refreshDecisionCache(memory: MemoryEntry[]): void {
  _cache = buildDecisionMap(memory);
}

export function getBestDecisions(limit = 20): ScoredDecision[] {
  return _cache.slice(0, limit);
}

export function getDecisionConfidence(action: string): ScoredDecision | undefined {
  const key = normalizeAction(action);
  return _cache.find(d => d.action === key);
}
