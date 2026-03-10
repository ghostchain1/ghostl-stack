/**
 * GhostBrain Core — Memory Query System
 *
 * Allows GhostBrain (and other AI agents) to ask semantic questions against
 * the full multi-layer memory:
 *
 *   "Have I seen this problem before?"
 *   "What solved it previously?"
 *   "What is the optimal repair action?"
 *
 * Query pipeline:
 *   1. Exact fix lookup (fix_memory)
 *   2. Pattern correlation lookup (pattern_memory)
 *   3. Vector similarity search (vector_memory / embedding_engine)
 *   4. Infra history lookup for the specific resource
 *   5. Merge + rank by confidence, return MemoryQueryResult[]
 */

import { lookupFix, getAllFixes }   from "./memory/fix_memory.js";
import { detectPatterns }           from "./memory/pattern_memory.js";
import { search as vectorSearch }   from "./memory/vector_memory.js";
import { getInfraHistory }          from "./memory/infrastructure_memory.js";
import { queryKnowledge }           from "./memory/cognitive_memory.js";
import { cosineSimilarity, encodeText } from "./embedding_engine.js";
import { log }                      from "./observability/event_logger.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MemoryQueryResult {
  source:       "fix_memory" | "pattern" | "vector" | "infra" | "cognitive";
  score:        number;
  summary:      string;
  action?:      string;
  confidence?:  number;
  metadata?:    Record<string, unknown>;
}

export interface MemoryQueryOptions {
  topK?:        number;   // default 10
  maxResults?:  number;   // alias for topK
  threshold?:   number;   // min score 0–1, default 0.2
  minScore?:    number;   // alias for threshold
  resourceId?:  string;   // narrow infra history to one resource
  includeRaw?:  boolean;  // include raw metadata in results
}

// ── Query implementation ──────────────────────────────────────────────────────

/**
 * Primary query function — hybrid recall across all memory layers.
 *
 * @param query   Natural-language or structured search string
 *                e.g. "oom_kill container ghostbrain-core"
 *                     "disk_exhaustion validator"
 *                     "cpu_high sustained 90%"
 */
export function queryMemory(
  query:   string,
  options: MemoryQueryOptions = {},
): MemoryQueryResult[] {
  const topK      = options.maxResults ?? options.topK ?? 10;
  const threshold = options.minScore   ?? options.threshold ?? 0.2;
  const results: MemoryQueryResult[] = [];

  // 1. Exact fix lookup
  const fix = lookupFix(query);
  if (fix) {
    results.push({
      source:     "fix_memory",
      score:      fix.successRate,
      summary:    `Known fix (${(fix.successRate * 100).toFixed(1)}% success): ${fix.solution}`,
      action:     fix.actionType,
      confidence: fix.successRate,
      metadata:   options.includeRaw ? fix.params : undefined,
    });
  }

  // 2. Top fix candidates by similarity
  const allFixes = getAllFixes();
  const qVec = encodeText(query);
  for (const f of allFixes) {
    if (f === fix) continue;  // already added
    const fVec = encodeText(`${f.problem} ${f.solution} ${f.actionType}`);
    const sim  = cosineSimilarity(qVec, fVec);
    if (sim >= threshold) {
      results.push({
        source:     "fix_memory",
        score:      sim * f.successRate,
        summary:    `Similar fix (${(sim * 100).toFixed(1)}% match, ${(f.successRate * 100).toFixed(1)}% success): ${f.solution}`,
        action:     f.actionType,
        confidence: f.successRate,
        metadata:   options.includeRaw ? f.params : undefined,
      });
    }
  }

  // 3. Pattern recall
  const patterns = detectPatterns(20);
  for (const p of patterns) {
    const pText = `${p.precursor} ${p.consequent}`;
    const pVec  = encodeText(pText);
    const sim   = cosineSimilarity(qVec, pVec);
    if (sim >= threshold) {
      results.push({
        source:     "pattern",
        score:      sim * p.confidence,
        summary:    `Pattern: ${p.precursor} → ${p.consequent} (conf=${(p.confidence * 100).toFixed(1)}%, seen=${p.count})`,
        confidence: p.confidence,
        metadata:   options.includeRaw ? { avgDelayMs: p.avgDelayMs, count: p.count } : undefined,
      });
    }
  }

  // 4. Vector semantic search
  const vecHits = vectorSearch(query, topK, threshold);
  for (const hit of vecHits) {
    results.push({
      source:     "vector",
      score:      hit.score,
      summary:    hit.text.slice(0, 200),
      metadata:   options.includeRaw ? hit.metadata as Record<string, unknown> : undefined,
    });
  }

  // 5. Cognitive knowledge base
  try {
    const cogKnowledge = queryKnowledge(undefined);
    for (const entry of cogKnowledge.slice(0, 5)) {
      const entryText = `${entry.category} ${entry.summary ?? entry.key ?? ""}`;
      const sim = cosineSimilarity(qVec, encodeText(entryText));
      if (sim >= threshold) {
        results.push({
          source:     "cognitive",
          score:      sim,
          summary:    `Knowledge: ${entry.summary ?? entry.key ?? entryText.slice(0, 100)}`,
          metadata:   options.includeRaw ? entry as unknown as Record<string, unknown> : undefined,
        });
      }
    }
  } catch {
    // cognitive_memory may not be hydrated yet
  }

  // 6. Infra history for specific resource
  if (options.resourceId) {
    try {
      const snaps = getInfraHistory(options.resourceId);
      if (snaps.length > 0) {
        const latest = snaps[snaps.length - 1]!;
        results.push({
          source:   "infra",
          score:    0.5,
          summary:  `Latest infra snapshot for ${options.resourceId}: cpu=${latest.cpuPct.toFixed(1)}% mem=${latest.memPct.toFixed(1)}%`,
          metadata: options.includeRaw ? latest as unknown as Record<string, unknown> : undefined,
        });
      }
    } catch { /* ok */ }
  }

  const merged = results
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  log.debug("memory_query: recall", `query="${query.slice(0, 60)}" results=${merged.length}`);
  return merged;
}

/**
 * Convenience: "Have I seen this problem before?"
 * Returns true + best result if a sufficiently confident match exists.
 */
export function haveISeenThis(problem: string, minConfidence = 0.5): {
  seen: boolean;
  bestMatch: MemoryQueryResult | null;
} {
  const results = queryMemory(problem, { topK: 3, threshold: minConfidence });
  const best    = results[0] ?? null;
  return { seen: !!best && best.score >= minConfidence, bestMatch: best };
}

/**
 * Convenience: "What solved it previously?"
 */
export function whatSolvedIt(problem: string): string | null {
  const fix = lookupFix(problem);
  if (fix) return fix.solution;

  const results = queryMemory(problem, { topK: 5 });
  const fixResult = results.find(r => r.source === "fix_memory" || r.action);
  return fixResult?.action ?? null;
}

/**
 * Convenience: "What is the optimal repair?"
 * Returns the action string with highest combined confidence.
 */
export function optimalRepair(problem: string): {
  action: string;
  confidence: number;
  rationale:  string;
} | null {
  const results = queryMemory(problem, { topK: 5 });
  const best    = results.find(r => r.action);
  if (!best) return null;
  return {
    action:     best.action!,
    confidence: best.confidence ?? best.score,
    rationale:  best.summary,
  };
}
