/**
 * GhostBrain Core — Memory Engine
 *
 * Central unified facade for all three memory layers:
 *   1. Short-term  — Redis (real-time decisions, active metrics, running task states)
 *   2. Mid-term    — PostgreSQL (structured operational knowledge, event history)
 *   3. Long-term   — Qdrant vector DB + file-backed store (semantic similarity)
 *
 * Public API:
 *   store_event()           — persist a raw infrastructure event to all relevant layers
 *   store_pattern()         — persist a learned task pattern
 *   store_decision()        — persist an AI decision for audit + outcome tracking
 *   recall_similar_events() — semantic lookup against vector + pattern store
 *   predict_next_action()   — combine pattern confidence + failure risk → top recommendation
 *
 * All three backends are optional (graceful degradation to in-process fallbacks).
 */

import { recordEvent, getTopPatterns } from "./memory/pattern_memory.js";
import type { RawEvent, PatternEntry }  from "./memory/pattern_memory.js";
import { store as vectorStore, search as vectorSearch } from "./memory/vector_memory.js";
import { recordInfraSnapshot }          from "./memory/infrastructure_memory.js";
import { recordFix, lookupFix }         from "./memory/fix_memory.js";
import { recordOptimization }           from "./memory/performance_memory.js";
import { encodeEvent, encodeText }      from "./embedding_engine.js";
import { rSet, rGet }                   from "./db/redis_client.js";
import { execute }                      from "./db/postgres_client.js";
import {
  qdrantUpsert, qdrantSearch, isQdrantReady,
  COLLECTIONS, newPointId,
}                                       from "./db/qdrant_client.js";
import { recordAuditEntry }             from "./memory/memory_audit.js";
import { log }                          from "./observability/event_logger.js";
import { incMemoryEvents }              from "./observability/metrics_exporter.js";
import { inc }                          from "./observability/metrics_exporter.js";
// ── Types ─────────────────────────────────────────────────────────────────────

export interface MemoryEvent {
  resourceId:  string;
  layer:       string;
  category?:   string;   // optional — falls back to type
  label?:      string;   // optional — falls back to type
  severity?:   "info" | "warn" | "warning" | "error" | "critical";
  payload?:    Record<string, unknown>;
  ts?:         number;
  /** Deprecated shorthand — maps to category:label */
  type?:       string;
  /** Deprecated shorthand — maps to resourceId */
  source?:     string;
}

export interface MemoryPattern {
  triggerCategory?: string;
  triggerLabel?:    string;
  action?:          string;
  params?:          Record<string, unknown>;
  successRate?:     number;
  /** Deprecated shorthand */
  type?:            string;
  resourceId?:      string;
  description?:     string;
  confidence?:      number;
  payload?:         Record<string, unknown>;
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
// In-process Map used as synchronous fast-path; real Redis writes happen async.

const _shortTerm = new Map<string, { value: unknown; expiresAt: number }>();

function shortTermSet(key: string, value: unknown, ttlMs = 60_000): void {
  _shortTerm.set(key, { value, expiresAt: Date.now() + ttlMs });
  // Async write to real Redis (fire-and-forget, TTL in seconds)
  void rSet(key, value, Math.ceil(ttlMs / 1_000));
}

function shortTermGet<T>(key: string): T | null {
  const entry = _shortTerm.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { _shortTerm.delete(key); return null; }
  return entry.value as T;
}

// Evict expired entries from the in-process map periodically
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of _shortTerm) if (now > v.expiresAt) _shortTerm.delete(k);
}, 30_000).unref();

// ── Async backend persistence helpers ─────────────────────────────────────────

/** Persist an event to PostgreSQL system_events + Qdrant neural memory. */
async function persistEventToBackends(
  ev:       MemoryEvent,
  category: string,
  label:    string,
  ts:       number,
): Promise<void> {
  const occurredAt = new Date(ts).toISOString();
  const severity   = ev.severity === "warn" ? "warning" : (ev.severity ?? "info");

  // PostgreSQL — operational memory (mid-term)
  await execute(
    `INSERT INTO system_events
       (resource_id, layer, category, label, severity, payload, chain_id, occurred_at)
     VALUES ($1, $2, $3, $4, $5::severity_enum, $6, $7, $8)`,
    [
      ev.resourceId,
      ev.layer,
      category,
      label,
      severity,
      JSON.stringify(ev.payload ?? {}),
      null,
      occurredAt,
    ],
  );

  // Qdrant — long-term neural memory
  if (isQdrantReady()) {
    const vector = encodeEvent({
      resourceId: ev.resourceId,
      category,
      label,
      layer: ev.layer,
      payload: ev.payload,
    });
    await qdrantUpsert(COLLECTIONS.SYSTEM_LOGS, [{
      id:      newPointId(),
      vector,
      payload: { ...ev, category, label, ts, occurred_at: occurredAt },
    }]);
  }
}

/** Persist a decision to PostgreSQL ai_decisions + Qdrant + audit log. */
async function persistDecisionToBackends(decision: MemoryDecision): Promise<void> {
  const now = new Date().toISOString();

  // PostgreSQL — ai_decisions audit table
  await execute(
    `INSERT INTO ai_decisions
       (agent, decision_type, resource_id, layer, rationale, confidence,
        action_taken, requires_human, policy_guard, decided_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      decision.agent,
      decision.decisionType,
      decision.resourceId,
      decision.layer,
      decision.rationale,
      decision.confidence,
      JSON.stringify(decision.actionTaken),
      decision.requiresHuman ?? false,
      decision.policyGuard   ?? "ALLOW",
      now,
    ],
  );

  // Qdrant — embed the decision for future association
  if (isQdrantReady()) {
    const text   = `agent=${decision.agent} type=${decision.decisionType} resource=${decision.resourceId} rationale=${decision.rationale}`;
    const vector = encodeText(text);
    await qdrantUpsert(COLLECTIONS.REPAIR_STRATEGIES, [{
      id:      newPointId(),
      vector,
      payload: { ...decision, type: "decision", recorded_at: now },
    }]);
  }

  // HMAC audit log — tamper-proof record
  await recordAuditEntry({
    ts:           Date.now(),
    agent:        decision.agent,
    decisionType: decision.decisionType,
    resourceId:   decision.resourceId,
    layer:        decision.layer,
    rationale:    decision.rationale,
    actionTaken:  decision.actionTaken,
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Store an infrastructure event across all memory layers.
 *
 * Sync path (zero-latency):
 *   - Short-term in-process Map (+ async Redis write)
 *   - Pattern co-occurrence table
 *   - File-backed TF-IDF vector store
 *
 * Async fire-and-forget backends (non-blocking):
 *   - PostgreSQL system_events table
 *   - Qdrant neural memory (system_logs_embeddings collection)
 */
export function store_event(ev: MemoryEvent): void {
  const ts       = ev.ts ?? Date.now();
  const category = ev.category ?? ev.type ?? "event";
  const label    = ev.label    ?? ev.type ?? "unknown";

  // 1. Short-term (real-time active state — in-process + async Redis)
  const stKey = `event:${ev.resourceId}:${label}`;
  shortTermSet(stKey, { ...ev, ts }, 5 * 60_000);

  // 2. Mid-term pattern correlation (in-process, sync)
  const rawEvent: RawEvent = { resourceId: ev.resourceId, label, category, ts };
  recordEvent(rawEvent);

  // 3. Long-term file-backed vector store (sync, immediate semantic recall)
  const text = `[${ev.layer}] ${category}:${label} on ${ev.resourceId} — ${JSON.stringify(ev.payload ?? {})}`;
  vectorStore(text, text, { ...ev, category, label, ts });

  // 4. Async: persist to PostgreSQL + Qdrant (fire-and-forget, non-blocking)
  void persistEventToBackends(ev, category, label, ts);

  incMemoryEvents();
  inc("ghostbrain_memory_events_total", "Neural memory events stored");
  log.debug("memory_engine: store_event", `${label} on ${ev.resourceId}`);
}

/**
 * Store a learned task pattern (mid-term + vector).
 */
export function store_pattern(pattern: MemoryPattern): void {
  const tc   = pattern.triggerCategory ?? pattern.type ?? "event";
  const tl   = pattern.triggerLabel    ?? pattern.description ?? "unknown";
  const act  = pattern.action          ?? "observe";
  const text = `pattern trigger=${tc}:${tl} action=${act}`;
  vectorStore(text, text, { ...pattern, type: "pattern" });
  log.debug("memory_engine: store_pattern", `${tc}:${tl}`);
}

/**
 * Store an AI decision across all layers:
 *   - Short-term: in-process Map + Redis (TTL 10 min)
 *   - Long-term: file-backed vector + Qdrant repair_strategy_embeddings
 *   - Audit: HMAC-signed tamper-proof record (PostgreSQL + NDJSON)
 */
export function store_decision(decision: MemoryDecision): void {
  // Short-term: track active decision per resource
  shortTermSet(`decision:${decision.resourceId}`, decision, 10 * 60_000);

  // Long-term: file-backed vector (immediate recall)
  const text = `agent=${decision.agent} type=${decision.decisionType} resource=${decision.resourceId} rationale=${decision.rationale}`;
  vectorStore(text, text, { ...decision, type: "decision" });

  // Async: PostgreSQL ai_decisions + Qdrant + HMAC audit (fire-and-forget)
  void persistDecisionToBackends(decision);

  inc("ghostbrain_memory_decisions_total", "AI decisions stored to neural memory");
  log.debug("memory_engine: store_decision", `agent=${decision.agent} resource=${decision.resourceId}`);
}

/**
 * Recall similar past events using semantic vector search + pattern matching.
 * Queries all three memory layers: Qdrant (neural) → file vector → patterns → fixes.
 */
export async function recall_similar_events(query: string, topK = 5): Promise<RecallResult[]> {
  const results: RecallResult[] = [];

  // Qdrant semantic search (long-term neural memory) — when available
  if (isQdrantReady()) {
    const qVec    = encodeText(query);
    const qdHits  = await qdrantSearch(COLLECTIONS.SYSTEM_LOGS, qVec, topK, 0.3);
    for (const hit of qdHits) {
      results.push({
        source:      "vector",
        score:       hit.score,
        description: String(hit.payload.label ?? hit.payload.category ?? "neural_memory_result"),
        action:      String(hit.payload.actionTaken ?? "") || undefined,
        metadata:    hit.payload,
      });
    }
  }

  // File-backed vector recall (always available)
  const vecHits = await Promise.resolve(vectorSearch(query, topK, 0.1));
  for (const hit of vecHits) {
    results.push({
      source:      "vector",
      score:       hit.score,
      description: hit.text,
      metadata:    hit.metadata as Record<string, unknown>,
    });
  }

  // Pattern recall
  const patterns = getTopPatterns(topK);
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
  const patterns = getTopPatterns(10);
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
  ts?: number;
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
  recordFix(opts.problem, opts.solution, opts.actionType, opts.params, opts.success, opts.recoveryMs);
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
    topPatterns:    getTopPatterns(5),
  };
}
