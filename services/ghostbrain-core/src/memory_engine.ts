/**
 * GhostBrain Core — Memory Engine
 *
 * Central unified facade for all three memory layers:
 *   1. Short-term  — Redis (real-time decisions, active metrics, running task states)
 *   2. Mid-term    — PostgreSQL (structured operational knowledge, event history)
 *   3. Long-term   — Vector store (semantic similarity, embedding-based recall)
 *
 * Public API:
 *   store_event()           — persist a raw infrastructure event to all relevant layers
 *   store_pattern()         — persist a learned task pattern
 *   store_decision()        — persist an AI decision for audit + outcome tracking
 *   recall_similar_events() — semantic lookup against vector + pattern store
 *   predict_next_action()   — combine pattern confidence + failure risk → top recommendation
 */

import { recordEvent, detectPatterns } from "./memory/pattern_memory.js";
import type { RawEvent, PatternEntry }  from "./memory/pattern_memory.js";
import { storeVector as vectorStore, search as vectorSearch } from "./memory/vector_memory.js";
import { recordInfraSnapshot }          from "./memory/infrastructure_memory.js";
import { recordFixResult, lookupFix }   from "./memory/fix_memory.js";
import { recordOptimization }      from "./memory/performance_memory.js";
import { log }                          from "./observability/event_logger.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MemoryEvent {
  resourceId:  string;
  layer:       string;
  category:    string;
  label:       string;
  severity?:   "info" | "warning" | "error" | "critical";
  payload?:    Record<string, unknown>;
  ts?:         number;
}

export interface MemoryPattern {
  triggerCategory: string;
  triggerLabel:    string;
  action:          string;
  params?:         Record<string, unknown>;
  successRate?:    number;
}

export interface MemoryDecision {
  agent:          string;
  decisionType:   string;
  resourceId:     string;
  layer:          string;
  rationale:      string;
  confidence:     number;
  actionTaken:    Record<string, unknown>;
  requiresHuman?: boolean;
  policyGuard?:   "ALLOW" | "DENY" | "REQUIRE_HUMAN_APPROVAL";
}

export interface RecallResult {
  source:      "vector" | "pattern" | "fix";
  score:       number;
  description: string;
  action?:     string;
  metadata?:   Record<string, unknown>;
}

export interface ActionRecommendation {
  action:       string;
  confidence:   number;
  rationale:    string;
  params?:      Record<string, unknown>;
  fromPattern?: PatternEntry;
}

// ── Short-term (Redis) helpers ────────────────────────────────────────────────
// For now we use a lightweight in-process Map as Redis adapter (Redis connection
// is optional). Replace with ioredis client when REDIS_URL is set.

const _shortTerm = new Map<string, { value: unknown; expiresAt: number }>();

function shortTermSet(key: string, value: unknown, ttlMs = 60_000): void {
  _shortTerm.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function shortTermGet<T>(key: string): T | null {
  const entry = _shortTerm.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { _shortTerm.delete(key); return null; }
  return entry.value as T;
}

// Evict expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of _shortTerm) if (now > v.expiresAt) _shortTerm.delete(k);
}, 30_000).unref();

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Store an infrastructure event across all memory layers.
 * - Short-term: keyed by resourceId + label (TTL 5 min)
 * - Mid-term: pattern correlation via pattern_memory
 * - Long-term: vector embedding for semantic recall
 */
export function store_event(ev: MemoryEvent): void {
  const ts = ev.ts ?? Date.now();

  // 1. Short-term (real-time active state)
  const stKey = `event:${ev.resourceId}:${ev.label}`;
  shortTermSet(stKey, { ...ev, ts }, 5 * 60_000);

  // 2. Mid-term (pattern correlation)
  const rawEvent: RawEvent = {
    resourceId: ev.resourceId,
    label:      ev.label,
    category:   ev.category,
    ts,
  };
  recordEvent(rawEvent);

  // 3. Long-term (vector store)
  const text = `[${ev.layer}] ${ev.category}:${ev.label} on ${ev.resourceId} — ${JSON.stringify(ev.payload ?? {})}`;
  vectorStore(text, text, { ...ev, ts });

  log.debug("memory_engine: store_event", `${ev.label} on ${ev.resourceId}`);
}

/**
 * Store a learned task pattern (mid-term + vector).
 */
export function store_pattern(pattern: MemoryPattern): void {
  const text = `pattern trigger=${pattern.triggerCategory}:${pattern.triggerLabel} action=${pattern.action}`;
  vectorStore(text, text, { ...pattern, type: "pattern" });
  log.debug("memory_engine: store_pattern", `${pattern.triggerCategory}:${pattern.triggerLabel}`);
}

/**
 * Store an AI decision (short-term active state + long-term vector).
 */
export function store_decision(decision: MemoryDecision): void {
  // Short-term: track active decision per resource
  shortTermSet(`decision:${decision.resourceId}`, decision, 10 * 60_000);

  // Long-term: embed for future recall
  const text = `agent=${decision.agent} type=${decision.decisionType} resource=${decision.resourceId} rationale=${decision.rationale}`;
  vectorStore(text, text, { ...decision, type: "decision" });

  log.debug("memory_engine: store_decision", `agent=${decision.agent} resource=${decision.resourceId}`);
}

/**
 * Recall similar past events using semantic vector search + pattern matching.
 */
export function recall_similar_events(query: string, topK = 5): RecallResult[] {
  const results: RecallResult[] = [];

  // Vector recall
  const vecHits = vectorSearch(query, topK, 0.2);
  for (const hit of vecHits) {
    results.push({
      source:      "vector",
      score:       hit.score,
      description: hit.text,
      metadata:    hit.metadata as Record<string, unknown>,
    });
  }

  // Pattern recall
  const patterns = detectPatterns(topK);
  for (const p of patterns) {
    const desc = `${p.precursor} → ${p.consequent} (conf=${(p.confidence * 100).toFixed(1)}%, seen=${p.count})`;
    results.push({
      source:      "pattern",
      score:       p.confidence,
      description: desc,
      metadata:    { avgDelayMs: p.avgDelayMs, count: p.count },
    });
  }

  // Fix recall
  const keyFix = lookupFix(query);
  if (keyFix) {
    results.push({
      source:      "fix",
      score:       keyFix.successRate,
      description: `Known fix for "${keyFix.problem}": ${keyFix.solution}`,
      action:      keyFix.actionType,
      metadata:    keyFix.params,
    });
  }

  return results.sort((a, b) => b.score - a.score).slice(0, topK);
}

/**
 * Predict the next best action for a given resource + recent event label.
 * Combines pattern confidence and fix history into a ranked recommendation.
 */
export function predict_next_action(resourceId: string, eventLabel: string): ActionRecommendation | null {
  // Check active short-term state
  const active = shortTermGet<MemoryEvent>(`event:${resourceId}:${eventLabel}`);
  if (!active) log.debug("memory_engine: predict", `no active short-term for ${resourceId}:${eventLabel}`);

  // Best pattern match
  const patterns = detectPatterns(10);
  const match = patterns.find(p => p.consequent.includes(eventLabel) || p.precursor.includes(eventLabel));

  // Best fix
  const fix = lookupFix(eventLabel);

  if (!match && !fix) return null;

  if (fix && (!match || fix.successRate > match.confidence)) {
    return {
      action:     fix.actionType,
      confidence: fix.successRate,
      rationale:  `Known fix with ${(fix.successRate * 100).toFixed(1)}% success rate for "${fix.problem}"`,
      params:     fix.params,
    };
  }

  if (match) {
    return {
      action:       "monitor_and_preempt",
      confidence:   match.confidence,
      rationale:    `Pattern: ${match.precursor} predicts ${match.consequent} with ${(match.confidence * 100).toFixed(1)}% confidence (avg delay ${match.avgDelayMs.toFixed(0)} ms)`,
      fromPattern:  match,
    };
  }

  return null;
}

// ── Composite record helpers ──────────────────────────────────────────────────

/** Record an infra snapshot + push event to memory. */
export function record_infra_snapshot(snap: {
  resourceId: string; layer: string;
  cpuPct: number; memPct: number;
  diskIoPct?: number; netMbps?: number;
  restarts?: number; healthy?: boolean;
  meta?: Record<string, unknown>;
}): void {
  recordInfraSnapshot({
    ts:        Date.now(),
    layer:     snap.layer as import("./memory/infrastructure_memory.js").InfraLayer,
    resourceId: snap.resourceId,
    cpuPct:    snap.cpuPct,
    memPct:    snap.memPct,
    diskIoPct: snap.diskIoPct ?? 0,
    netMbps:   snap.netMbps   ?? 0,
    restarts:  snap.restarts  ?? 0,
    healthy:   snap.healthy   ?? true,
    meta:      snap.meta      ?? {},
  });
  store_event({
    resourceId: snap.resourceId,
    layer:      snap.layer,
    category:   "metrics",
    label:      snap.cpuPct > 85 ? "cpu_high" : snap.memPct > 90 ? "mem_high" : "normal",
    severity:   snap.cpuPct > 90 || snap.memPct > 92 ? "warning" : "info",
    payload:    { cpu: snap.cpuPct, mem: snap.memPct, disk: snap.diskIoPct, net: snap.netMbps },
  });
}

/** Record the outcome of a repair action and persist as a fix. */
export function record_repair_outcome(opts: {
  problem:     string;
  solution:    string;
  actionType:  string;
  params:      Record<string, unknown>;
  success:     boolean;
  recoveryMs:  number;
}): void {
  recordFixResult(opts.problem, opts.solution, opts.actionType, opts.params, opts.success, opts.recoveryMs);
  store_pattern({
    triggerCategory: "repair",
    triggerLabel:    opts.problem,
    action:          opts.actionType,
    params:          opts.params,
    successRate:     opts.success ? 1 : 0,
  });
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export function getMemoryEngineSummary() {
  return {
    shortTermKeys:  _shortTerm.size,
    topPatterns:    detectPatterns(5),
  };
}
