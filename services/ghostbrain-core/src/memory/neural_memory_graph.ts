/**
 * GhostBrain Core — Neural Memory Graph
 *
 * General-purpose causal graph for ALL infrastructure events across
 * GhostChain L1 (14000101), GhostL2 (901), GhostL3 (903), VMs, containers,
 * and services.
 *
 * Graph structure:
 *   Event → Cause → Action → Outcome
 *
 * Storage:
 *   - Primary:  PostgreSQL `memory_graph_nodes` + `memory_graph_edges` tables
 *   - Fallback: Delegates to the existing blockchain/memory_graph.ts (JSONL file)
 *
 * Query capabilities:
 *   - findChainsByEvent()    — find all chains matching an event label
 *   - predictOutcome()       — predict most likely outcome for a given event
 *   - getSuccessfulChains()  — chains where outcome.success === true
 *   - graphStats()           — counts, top-labels
 *
 * Prometheus metrics updated:
 *   ghostbrain_memory_graph_nodes_total
 *   ghostbrain_memory_graph_edges_total
 *   ghostbrain_memory_graph_chains_total
 */

import { randomUUID }       from "node:crypto";
import { execute, query }   from "../db/postgres_client.js";
import {
  addNode, addEdge, recordCausalChain,
  findCausalChains, getMemoryGraphStats,
  type GraphNode, type GraphEdge, type CausalChain, type NodeKind,
} from "../blockchain/memory_graph.js";
import { inc, set }         from "../observability/metrics_exporter.js";
import { log }              from "../observability/event_logger.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type { GraphNode, GraphEdge, CausalChain, NodeKind };

export interface CausalChainInput {
  event: {
    label:      string;
    resourceId: string;
    layer:      string;
    payload?:   Record<string, unknown>;
  };
  cause?: {
    label:   string;
    payload?: Record<string, unknown>;
  };
  action?: {
    label:   string;
    payload?: Record<string, unknown>;
  };
  outcome?: {
    label:   string;
    success: boolean;
    payload?: Record<string, unknown>;
  };
  confidence?: number;
}

// ── Internal graph counters ───────────────────────────────────────────────────

let _nodeCount   = 0;
let _edgeCount   = 0;
let _chainCount  = 0;

function updateMetrics(): void {
  set("ghostbrain_memory_graph_nodes_total", "Total nodes in neural memory graph", _nodeCount);
  set("ghostbrain_memory_graph_edges_total", "Total edges in neural memory graph", _edgeCount);
  set("ghostbrain_memory_graph_chains_total", "Total causal chains recorded", _chainCount);
}

// ── Core API ──────────────────────────────────────────────────────────────────

/**
 * Record a full causal chain: event → cause → action → outcome.
 *
 * Writes to:
 *   1. In-process file-backed graph (blockchain/memory_graph.ts) — always
 *   2. PostgreSQL memory_graph_nodes + memory_graph_edges — when available
 *
 * Returns the node IDs created (2–4 nodes).
 */
export async function recordChain(opts: CausalChainInput): Promise<string[]> {
  const conf = opts.confidence ?? 0.8;

  // 1. Always write to file-backed graph (existing system, zero-dependency)
  const ids = recordCausalChain({
    event:      opts.event,
    cause:      opts.cause,
    action:     opts.action,
    outcome:    opts.outcome,
    confidence: conf,
  });

  _nodeCount  += ids.length;
  _edgeCount  += Math.max(0, ids.length - 1);
  _chainCount += 1;
  updateMetrics();
  inc("ghostbrain_memory_graph_chains_total", "Causal chains recorded");

  // 2. Also write to PostgreSQL when available (fire-and-forget)
  void persistChainToDB(opts, ids, conf);

  log.debug("neural_memory_graph: chain_recorded", `event=${opts.event.label} nodes=${ids.length}`);
  return ids;
}

async function persistChainToDB(
  opts: CausalChainInput,
  ids:  string[],
  conf: number,
): Promise<void> {
  const now = new Date().toISOString();

  // Build node records
  const nodeLabels = [
    { kind: "event" as NodeKind,   label: opts.event.label,    payload: opts.event.payload ?? {} },
    opts.cause   ? { kind: "cause"   as NodeKind, label: opts.cause.label,   payload: opts.cause.payload   ?? {} } : null,
    opts.action  ? { kind: "action"  as NodeKind, label: opts.action.label,  payload: opts.action.payload  ?? {} } : null,
    opts.outcome ? { kind: "outcome" as NodeKind, label: opts.outcome.label, payload: { ...(opts.outcome.payload ?? {}), success: opts.outcome.success } } : null,
  ].filter(Boolean) as { kind: NodeKind; label: string; payload: Record<string, unknown> }[];

  for (let i = 0; i < nodeLabels.length && i < ids.length; i++) {
    const n = nodeLabels[i]!;
    await execute(
      `INSERT INTO memory_graph_nodes (id, kind, label, resource_id, layer, payload, recorded_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO NOTHING`,
      [ids[i], n.kind, n.label, opts.event.resourceId, opts.event.layer, JSON.stringify(n.payload), now],
    );
  }

  // Build edge records (each adjacent pair)
  const edgeRelations: GraphEdge["relation"][] = ["caused_by", "led_to", "resulted_in"];
  for (let i = 0; i < ids.length - 1; i++) {
    await execute(
      `INSERT INTO memory_graph_edges (id, from_id, to_id, relation, confidence, recorded_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [randomUUID(), ids[i], ids[i + 1], edgeRelations[i] ?? "resulted_in", conf, now],
    );
  }
}

// ── Query API ─────────────────────────────────────────────────────────────────

/**
 * Find causal chains matching an event label prefix.
 * Queries PostgreSQL first (full history), falls back to in-process file graph.
 */
export async function findChainsByEvent(
  labelPrefix: string,
  limit = 10,
): Promise<CausalChain[]> {
  // Try PostgreSQL first for full history
  const rows = await query<{
    event_label:   string;
    event_res:     string;
    event_layer:   string;
    cause_label:   string | null;
    action_label:  string | null;
    outcome_label: string | null;
    success:       boolean | null;
    confidence:    number;
  }>(
    `SELECT
       n_event.label   AS event_label,
       n_event.resource_id AS event_res,
       n_event.layer   AS event_layer,
       n_cause.label   AS cause_label,
       n_action.label  AS action_label,
       n_out.label     AS outcome_label,
       (n_out.payload->>'success')::boolean AS success,
       e1.confidence
     FROM memory_graph_edges e1
     JOIN memory_graph_nodes n_event ON n_event.id = e1.from_id AND n_event.kind = 'event'
     JOIN memory_graph_nodes n_cause ON n_cause.id = e1.to_id
     LEFT JOIN memory_graph_edges e2 ON e2.from_id = n_cause.id
     LEFT JOIN memory_graph_nodes n_action ON n_action.id = e2.to_id
     LEFT JOIN memory_graph_edges e3 ON e3.from_id = n_action.id
     LEFT JOIN memory_graph_nodes n_out ON n_out.id = e3.to_id
     WHERE n_event.label ILIKE $1
     ORDER BY e1.recorded_at DESC
     LIMIT $2`,
    [`${labelPrefix}%`, limit],
  );

  if (rows.length > 0) {
    return rows.map((r) => ({
      event: {
        id: randomUUID(), kind: "event" as NodeKind,
        label: r.event_label, resourceId: r.event_res, layer: r.event_layer, payload: {}, ts: Date.now(),
      },
      cause:   r.cause_label   ? { id: randomUUID(), kind: "cause"   as NodeKind, label: r.cause_label,   resourceId: r.event_res, layer: r.event_layer, payload: {}, ts: Date.now() } : undefined,
      action:  r.action_label  ? { id: randomUUID(), kind: "action"  as NodeKind, label: r.action_label,  resourceId: r.event_res, layer: r.event_layer, payload: {}, ts: Date.now() } : undefined,
      outcome: r.outcome_label ? { id: randomUUID(), kind: "outcome" as NodeKind, label: r.outcome_label, resourceId: r.event_res, layer: r.event_layer, payload: { success: r.success }, ts: Date.now() } : undefined,
      confidence: Number(r.confidence),
    }));
  }

  // Fallback: in-process file-backed graph
  return findCausalChains(labelPrefix, limit);
}

/**
 * Predict the most likely successful outcome for a given event label.
 * Queries stored chains for matching events with successful outcomes.
 */
export async function predictOutcome(
  eventLabel: string,
): Promise<{ action: string; outcome: string; confidence: number } | null> {
  const rows = await query<{
    action_label:  string;
    outcome_label: string;
    confidence:    number;
    success_count: string;
  }>(
    `SELECT
       n_action.label  AS action_label,
       n_out.label     AS outcome_label,
       AVG(e1.confidence) AS confidence,
       COUNT(*) AS success_count
     FROM memory_graph_edges e1
     JOIN memory_graph_nodes n_event ON n_event.id = e1.from_id AND n_event.kind = 'event'
     JOIN memory_graph_nodes n_cause ON n_cause.id = e1.to_id
     JOIN memory_graph_edges e2 ON e2.from_id = n_cause.id
     JOIN memory_graph_nodes n_action ON n_action.id = e2.to_id
     JOIN memory_graph_edges e3 ON e3.from_id = n_action.id
     JOIN memory_graph_nodes n_out ON n_out.id = e3.to_id
     WHERE n_event.label ILIKE $1
       AND (n_out.payload->>'success')::boolean = true
     GROUP BY n_action.label, n_out.label
     ORDER BY success_count DESC, confidence DESC
     LIMIT 1`,
    [`${eventLabel}%`],
  );

  if (rows.length > 0) {
    const r = rows[0]!;
    return {
      action:     r.action_label,
      outcome:    r.outcome_label,
      confidence: Number(r.confidence),
    };
  }
  return null;
}

/**
 * Return top successful repair chains (highest confidence + success count).
 */
export async function getSuccessfulChains(limit = 20): Promise<{
  eventLabel:  string;
  action:      string;
  outcome:     string;
  confidence:  number;
  count:       number;
}[]> {
  const rows = await query<{
    event_label:   string;
    action_label:  string;
    outcome_label: string;
    confidence:    number;
    count:         string;
  }>(
    `SELECT
       n_event.label  AS event_label,
       n_action.label AS action_label,
       n_out.label    AS outcome_label,
       AVG(e1.confidence) AS confidence,
       COUNT(*)       AS count
     FROM memory_graph_edges e1
     JOIN memory_graph_nodes n_event  ON n_event.id = e1.from_id AND n_event.kind = 'event'
     JOIN memory_graph_nodes n_cause  ON n_cause.id = e1.to_id
     JOIN memory_graph_edges e2 ON e2.from_id = n_cause.id
     JOIN memory_graph_nodes n_action ON n_action.id = e2.to_id
     JOIN memory_graph_edges e3 ON e3.from_id = n_action.id
     JOIN memory_graph_nodes n_out    ON n_out.id = e3.to_id
     WHERE (n_out.payload->>'success')::boolean = true
     GROUP BY n_event.label, n_action.label, n_out.label
     ORDER BY count DESC, confidence DESC
     LIMIT $1`,
    [limit],
  );

  return rows.map((r) => ({
    eventLabel:  r.event_label,
    action:      r.action_label,
    outcome:     r.outcome_label,
    confidence:  Number(r.confidence),
    count:       Number(r.count),
  }));
}

/**
 * Return graph statistics (in-memory counts + PostgreSQL counts).
 */
export async function graphStats(): Promise<{
  inMemory: ReturnType<typeof getMemoryGraphStats>;
  postgres: { nodes: number; edges: number };
  counters: { nodes: number; edges: number; chains: number };
}> {
  const pgCounts = await query<{ nodes: string; edges: string }>(
    `SELECT
       (SELECT COUNT(*) FROM memory_graph_nodes) AS nodes,
       (SELECT COUNT(*) FROM memory_graph_edges) AS edges`,
  );

  return {
    inMemory: getMemoryGraphStats(),
    postgres: {
      nodes: Number(pgCounts[0]?.nodes ?? 0),
      edges: Number(pgCounts[0]?.edges ?? 0),
    },
    counters: {
      nodes:  _nodeCount,
      edges:  _edgeCount,
      chains: _chainCount,
    },
  };
}
