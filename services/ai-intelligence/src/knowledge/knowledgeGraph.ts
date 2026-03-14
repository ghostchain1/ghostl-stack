/**
 * knowledgeGraph.ts — In-memory entity relationship graph for the GhostStack ecosystem
 *
 * Maintains nodes (ecosystem entities) and directed weighted edges (relationships).
 * Seeded with canonical engine nodes and cross-engine relationships on startup.
 * Queries support type filtering and edge traversal.
 */

import { v4 as uuidv4 } from "uuid";
import logger from "../utils/logger";

// ── Types ─────────────────────────────────────────────────────────────────────

export type NodeType =
  | "engine"
  | "campaign"
  | "developer"
  | "validator"
  | "pool"
  | "market"
  | "contract"
  | "token"
  | "governance";

export interface KGNode {
  id:         string;
  type:       NodeType;
  label:      string;
  properties: Record<string, unknown>;
  createdAt:  number;
  updatedAt:  number;
}

export interface KGEdge {
  id:           string;
  from:         string;   // node id
  to:           string;   // node id
  relationship: string;   // e.g. "drives", "monitors", "funds", "governs"
  weight:       number;   // 0-1 strength
  timestamp:    number;
  properties:   Record<string, unknown>;
}

// ── Storage ───────────────────────────────────────────────────────────────────

const nodes = new Map<string, KGNode>();
const edges = new Map<string, KGEdge>();

// ── Node management ───────────────────────────────────────────────────────────

export function addNode(
  type:       NodeType,
  label:      string,
  properties: Record<string, unknown> = {},
  id?:        string,
): KGNode {
  const nodeId = id ?? uuidv4();
  const now    = Date.now();

  // Upsert — if node exists update properties
  if (nodes.has(nodeId)) {
    const existing = nodes.get(nodeId)!;
    const updated: KGNode = { ...existing, properties: { ...existing.properties, ...properties }, updatedAt: now };
    nodes.set(nodeId, updated);
    return updated;
  }

  const node: KGNode = { id: nodeId, type, label, properties, createdAt: now, updatedAt: now };
  nodes.set(nodeId, node);
  return node;
}

export function getNode(id: string): KGNode | undefined { return nodes.get(id); }

export function updateNode(id: string, properties: Record<string, unknown>): boolean {
  const n = nodes.get(id);
  if (!n) return false;
  nodes.set(id, { ...n, properties: { ...n.properties, ...properties }, updatedAt: Date.now() });
  return true;
}

// ── Edge management ───────────────────────────────────────────────────────────

export function addEdge(
  fromId:       string,
  toId:         string,
  relationship: string,
  weight        = 0.5,
  properties:   Record<string, unknown> = {},
): KGEdge | null {
  if (!nodes.has(fromId) || !nodes.has(toId)) {
    logger.warn(`[KnowledgeGraph] Edge rejected — unknown node(s): ${fromId} → ${toId}`);
    return null;
  }

  const edge: KGEdge = {
    id:           uuidv4(),
    from:         fromId,
    to:           toId,
    relationship,
    weight:       Math.max(0, Math.min(1, weight)),
    timestamp:    Date.now(),
    properties,
  };

  edges.set(edge.id, edge);
  return edge;
}

// ── Queries ───────────────────────────────────────────────────────────────────

export function queryNodes(type?: NodeType, limit = 100): KGNode[] {
  const all = [...nodes.values()];
  const filtered = type ? all.filter((n) => n.type === type) : all;
  return filtered.slice(0, limit);
}

export function queryEdges(nodeId?: string, limit = 100): KGEdge[] {
  const all = [...edges.values()];
  const filtered = nodeId ? all.filter((e) => e.from === nodeId || e.to === nodeId) : all;
  return filtered.slice(0, limit);
}

export function getNeighbours(nodeId: string): { node: KGNode; edge: KGEdge; direction: "out" | "in" }[] {
  const result: { node: KGNode; edge: KGEdge; direction: "out" | "in" }[] = [];
  for (const edge of edges.values()) {
    if (edge.from === nodeId) {
      const node = nodes.get(edge.to);
      if (node) result.push({ node, edge, direction: "out" });
    } else if (edge.to === nodeId) {
      const node = nodes.get(edge.from);
      if (node) result.push({ node, edge, direction: "in" });
    }
  }
  return result;
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export function getStats() {
  const nodeTypes: Partial<Record<NodeType, number>> = {};
  for (const n of nodes.values()) {
    nodeTypes[n.type] = (nodeTypes[n.type] ?? 0) + 1;
  }

  const relationshipCounts: Record<string, number> = {};
  for (const e of edges.values()) {
    relationshipCounts[e.relationship] = (relationshipCounts[e.relationship] ?? 0) + 1;
  }

  return {
    nodes:              nodes.size,
    edges:              edges.size,
    nodeTypes:          nodeTypes as Record<NodeType, number>,
    topRelationships:   Object.entries(relationshipCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([rel, count]) => ({ rel, count })),
  };
}

// ── Seed ──────────────────────────────────────────────────────────────────────

export function seedKnowledgeGraph(): void {
  if (nodes.size > 0) {
    logger.info("[KnowledgeGraph] Graph already seeded — skipping");
    return;
  }

  // ── Engine nodes (deterministic IDs for stable edge refs)
  const aims = addNode("engine", "AI Marketing Suite (AIMS)",   { port: 9970, status: "active" }, "engine-aims");
  const vge  = addNode("engine", "Validator Growth Engine (VGE)",{ port: 9971, status: "active" }, "engine-vge");
  const aae  = addNode("engine", "Adoption & Acquisition Engine (AAE)", { port: 9972, status: "active" }, "engine-aae");
  const gee  = addNode("engine", "Growth & Economy Engine (GEE)",{ port: 9973, status: "active" }, "engine-gee");
  const aee  = addNode("engine", "Autonomous Economy Engine (AEE)", { port: 9974, status: "active" }, "engine-aee");
  const aie  = addNode("engine", "AI Infrastructure Engine (AIE)", { port: 9975, status: "active" }, "engine-aie");
  const ase  = addNode("engine", "AI Security Engine (ASE)",    { port: 9976, status: "active" }, "engine-ase");
  const gie  = addNode("engine", "Ghost Intelligence Engine (GIE)", { port: 9977, status: "active" }, "engine-gie");

  // ── Key ecosystem entities
  const ghostToken   = addNode("token",      "GHOST Token",           { symbol: "GHOST", chain: "L2" },          "token-ghost");
  const govSystem    = addNode("governance", "Ghost DAO",             { proposals: 0 },                           "gov-dao");
  const lpPool       = addNode("pool",       "GHOST/ETH Liquidity",   { protocol: "Uniswap V3" },                "pool-ghost-eth");
  const devProgram   = addNode("developer",  "Ghost Developer Program",{ grants: 0 },                             "dev-program");
  const campaignMgr  = addNode("campaign",   "Marketing Campaign Hub", { active: 0 },                             "campaign-hub");
  const validatorSet = addNode("validator",  "Validator Set",          { active: 0 },                             "validator-set");

  // ── Engine cross-relationships
  addEdge(gie.id,  aims.id,  "coordinates",   0.9, { reason: "GIE provides intelligence to all engines" });
  addEdge(gie.id,  vge.id,   "coordinates",   0.9);
  addEdge(gie.id,  aae.id,   "coordinates",   0.8);
  addEdge(gie.id,  gee.id,   "coordinates",   0.8);
  addEdge(gie.id,  aee.id,   "coordinates",   0.85);
  addEdge(gie.id,  aie.id,   "coordinates",   0.85);
  addEdge(gie.id,  ase.id,   "coordinates",   0.9);

  addEdge(aims.id, campaignMgr.id,  "manages",   0.95);
  addEdge(vge.id,  validatorSet.id, "grows",     0.9);
  addEdge(aae.id,  devProgram.id,   "expands",   0.85);
  addEdge(gee.id,  lpPool.id,       "optimises", 0.8);
  addEdge(aee.id,  lpPool.id,       "funds",     0.9);
  addEdge(aee.id,  ghostToken.id,   "manages",   0.95);
  addEdge(ase.id,  validatorSet.id, "secures",   0.9);
  addEdge(aie.id,  aims.id,         "hosts",     0.8);

  // ── Token / governance flows
  addEdge(ghostToken.id, govSystem.id,    "grants-voting-power", 0.95);
  addEdge(govSystem.id,  devProgram.id,   "governs",             0.7);
  addEdge(govSystem.id,  campaignMgr.id,  "approves",            0.6);
  addEdge(lpPool.id,     ghostToken.id,   "provides-liquidity",  0.85);

  logger.info(`[KnowledgeGraph] Seeded ${nodes.size} nodes, ${edges.size} edges`);
}
