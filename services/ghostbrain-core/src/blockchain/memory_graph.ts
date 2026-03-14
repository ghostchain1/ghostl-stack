/**
 * GhostBrain — Neural Memory Graph
 *
 * Extends the flat event log into a causal graph:
 *
 *   Event → Cause → Action → Outcome
 *
 * Nodes are events/actions; directed edges encode causal relationships.
 * The graph is stored in memory (hot) and persisted as JSONL to disk.
 *
 * GhostBrain uses the graph to:
 *   - Find optimal response chains for novel problems
 *   - Predict downstream effects of actions
 *   - Identify high-confidence remedy patterns
 */

import { appendFileSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { log } from "../observability/event_logger.js";

// ── Config ────────────────────────────────────────────────────────────────────

const DATA_DIR  = process.env.GHOSTBRAIN_DATA_DIR ?? "/tmp/ghostbrain";
const GRAPH_FILE = join(DATA_DIR, "memory_graph.jsonl");

// ── Types ─────────────────────────────────────────────────────────────────────

export type NodeKind = "event" | "cause" | "action" | "outcome";

export interface GraphNode {
  id:          string;
  kind:        NodeKind;
  label:       string;
  resourceId:  string;
  layer:       string;
  payload:     Record<string, unknown>;
  ts:          number;
}

export interface GraphEdge {
  fromId:      string;
  toId:        string;
  relation:    "caused_by" | "led_to" | "resolved_by" | "resulted_in";
  confidence:  number;   // 0–1
  ts:          number;
}

export interface CausalChain {
  event:    GraphNode;
  cause?:   GraphNode;
  action?:  GraphNode;
  outcome?: GraphNode;
  confidence: number;
}

// ── Internal state ─────────────────────────────────────────────────────────────

const _nodes = new Map<string, GraphNode>();
const _edges: GraphEdge[] = [];

// ── Persistence ───────────────────────────────────────────────────────────────

function ensureDir(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function persist(record: GraphNode | GraphEdge): void {
  ensureDir();
  try { appendFileSync(GRAPH_FILE, JSON.stringify(record) + "\n"); }
  catch { /* non-fatal */ }
}

export function hydrateGraph(): void {
  if (!existsSync(GRAPH_FILE)) return;
  try {
    const lines = readFileSync(GRAPH_FILE, "utf8").split("\n").filter(Boolean);
    for (const line of lines) {
      const r = JSON.parse(line) as GraphNode | GraphEdge;
      if ("kind" in r) {
        _nodes.set(r.id, r as GraphNode);
      } else {
        _edges.push(r as GraphEdge);
      }
    }
    log.debug("memory_graph: hydrated", `nodes=${_nodes.size} edges=${_edges.length}`);
  } catch (err) {
    log.warn("memory_graph: hydrate_error", String(err));
  }
}

// ── Core API ──────────────────────────────────────────────────────────────────

let _nodeSeq = 0;
function nextId(kind: NodeKind): string {
  return `${kind}-${Date.now()}-${++_nodeSeq}`;
}

/**
 * Add a node to the memory graph.
 */
export function addNode(
  kind:       NodeKind,
  label:      string,
  resourceId: string,
  layer:      string,
  payload:    Record<string, unknown> = {},
): GraphNode {
  const node: GraphNode = {
    id: nextId(kind),
    kind,
    label,
    resourceId,
    layer,
    payload,
    ts: Date.now(),
  };
  _nodes.set(node.id, node);
  persist(node);
  return node;
}

/**
 * Connect two nodes with a directed edge.
 */
export function addEdge(
  fromId:     string,
  toId:       string,
  relation:   GraphEdge["relation"],
  confidence: number = 0.8,
): GraphEdge {
  const edge: GraphEdge = { fromId, toId, relation, confidence, ts: Date.now() };
  _edges.push(edge);
  persist(edge);
  return edge;
}

/**
 * Record a complete causal chain: event → cause → action → outcome.
 * Returns the four node IDs so callers can reference them later.
 */
export function recordCausalChain(opts: {
  event:      { label: string; resourceId: string; layer: string; payload?: Record<string, unknown> };
  cause?:     { label: string; payload?: Record<string, unknown> };
  action?:    { label: string; payload?: Record<string, unknown> };
  outcome?:   { label: string; success: boolean; payload?: Record<string, unknown> };
  confidence?: number;
}): string[] {
  const ids: string[] = [];
  const conf = opts.confidence ?? 0.8;

  const eventNode = addNode("event", opts.event.label, opts.event.resourceId, opts.event.layer, opts.event.payload ?? {});
  ids.push(eventNode.id);

  if (opts.cause) {
    const causeNode = addNode("cause", opts.cause.label, opts.event.resourceId, opts.event.layer, opts.cause.payload ?? {});
    addEdge(eventNode.id, causeNode.id, "caused_by", conf);
    ids.push(causeNode.id);

    if (opts.action) {
      const actionNode = addNode("action", opts.action.label, opts.event.resourceId, opts.event.layer, opts.action.payload ?? {});
      addEdge(causeNode.id, actionNode.id, "led_to", conf);
      ids.push(actionNode.id);

      if (opts.outcome) {
        const outcomeNode = addNode("outcome", opts.outcome.label, opts.event.resourceId, opts.event.layer, {
          ...opts.outcome.payload,
          success: opts.outcome.success,
        });
        addEdge(actionNode.id, outcomeNode.id, opts.outcome.success ? "resulted_in" : "resolved_by", conf);
        ids.push(outcomeNode.id);
      }
    }
  }

  log.debug("memory_graph: chain_recorded", `event=${opts.event.label} nodes=${ids.length}`);
  return ids;
}

/**
 * Find causal chains that match a label prefix.
 */
export function findCausalChains(labelPrefix: string, limit = 10): CausalChain[] {
  const eventNodes = [..._nodes.values()]
    .filter(n => n.kind === "event" && n.label.toLowerCase().startsWith(labelPrefix.toLowerCase()))
    .slice(-limit);

  const results: CausalChain[] = [];

  for (const event of eventNodes) {
    const chain: CausalChain = { event, confidence: 0.8 };

    // Follow edges: event → cause
    const causeEdge = _edges.find(e => e.fromId === event.id && e.relation === "caused_by");
    if (causeEdge) {
      chain.cause = _nodes.get(causeEdge.toId);
      chain.confidence = causeEdge.confidence;

      // cause → action
      const actionEdge = _edges.find(e => e.fromId === causeEdge.toId && e.relation === "led_to");
      if (actionEdge) {
        chain.action = _nodes.get(actionEdge.toId);

        // action → outcome
        const outcomeEdge = _edges.find(e =>
          e.fromId === actionEdge.toId &&
          (e.relation === "resulted_in" || e.relation === "resolved_by"),
        );
        if (outcomeEdge) {
          chain.outcome = _nodes.get(outcomeEdge.toId);
        }
      }
    }

    results.push(chain);
  }

  return results;
}

/**
 * Find the most successful action for a given event label.
 */
export function getBestAction(eventLabel: string): string | null {
  const chains = findCausalChains(eventLabel, 50);
  const successes = chains.filter(c => c.outcome?.payload.success === true && c.action);

  if (successes.length === 0) return null;

  // Return the action label with highest confidence
  const best = successes.sort((a, b) => b.confidence - a.confidence)[0];
  return best?.action?.label ?? null;
}

export function getMemoryGraphStats() {
  return {
    nodes:     _nodes.size,
    edges:     _edges.length,
    byKind: {
      event:   [..._nodes.values()].filter(n => n.kind === "event").length,
      cause:   [..._nodes.values()].filter(n => n.kind === "cause").length,
      action:  [..._nodes.values()].filter(n => n.kind === "action").length,
      outcome: [..._nodes.values()].filter(n => n.kind === "outcome").length,
    },
  };
}
