/**
 * GCL — Knowledge Graph
 * Tracks semantic relationships between services, agents, strategies
 * and outcomes as a weighted, in-memory directed graph.
 */

import { v4 as uuid } from "uuid";

export type NodeType = "service" | "agent" | "strategy" | "outcome" | "domain" | "event";
export type RelationType =
  | "controls"
  | "triggers"
  | "produces"
  | "mitigates"
  | "depends_on"
  | "correlates_with"
  | "governs"
  | "funds";

export interface KnowledgeNode {
  id:         string;
  type:       NodeType;
  label:      string;
  properties: Record<string, unknown>;
  createdAt:  number;
}

export interface KnowledgeEdge {
  id:           string;
  from:         string;     // node id
  to:           string;     // node id
  relationship: RelationType;
  weight:       number;     // 0.0 – 1.0
  timestamp:    number;
  description?: string;
}

// ── Store ─────────────────────────────────────────────────────────────────────

const _nodes: Map<string, KnowledgeNode> = new Map();
const _edges: KnowledgeEdge[]            = [];

// ── Seed ─────────────────────────────────────────────────────────────────────

function makeNode(type: NodeType, label: string, properties: Record<string, unknown> = {}): KnowledgeNode {
  return { id: uuid(), type, label, properties, createdAt: Date.now() };
}

function addNode(node: KnowledgeNode): KnowledgeNode {
  _nodes.set(node.id, node);
  return node;
}

function addEdge(
  from: KnowledgeNode,
  to:   KnowledgeNode,
  rel:  RelationType,
  weight = 0.80,
  desc?: string,
): KnowledgeEdge {
  const edge: KnowledgeEdge = {
    id: uuid(), from: from.id, to: to.id,
    relationship: rel, weight, timestamp: Date.now(), description: desc,
  };
  _edges.push(edge);
  return edge;
}

export function seedKnowledgeGraph(): void {
  // ── Services ──────────────────────────────────────────────────────────────
  const n_marketing   = addNode(makeNode("service",  "Marketing Engine",    { port: 9982 }));
  const n_revenue     = addNode(makeNode("service",  "Revenue Engine",      { port: 9983 }));
  const n_scaling     = addNode(makeNode("service",  "Scaling Engine",      { port: 9984 }));
  const n_are         = addNode(makeNode("service",  "Adaptive Response Engine", { port: 9985 }));
  const n_aiops       = addNode(makeNode("service",  "AIOps",               { port: 9988 }));
  const n_gcl         = addNode(makeNode("service",  "GhostBrain Cognitive Layer", { port: 9989 }));

  // ── Agents ────────────────────────────────────────────────────────────────
  const n_strategist  = addNode(makeNode("agent", "strategist-agent",  { domain: "marketing" }));
  const n_economy     = addNode(makeNode("agent", "economy-agent",     { domain: "tokenomics" }));
  const n_operator    = addNode(makeNode("agent", "operator-agent",    { domain: "infrastructure" }));
  const n_defender    = addNode(makeNode("agent", "defender-agent",    { domain: "security" }));
  const n_auditor     = addNode(makeNode("agent", "auditor-agent",     { domain: "security" }));
  const n_architect   = addNode(makeNode("agent", "architect-agent",   { domain: "architecture" }));
  const n_governance  = addNode(makeNode("agent", "governance-agent",  { domain: "governance" }));

  // ── Outcomes ──────────────────────────────────────────────────────────────
  const n_userGrowth      = addNode(makeNode("outcome", "User Growth",        { unit: "users/week" }));
  const n_treasury        = addNode(makeNode("outcome", "Treasury Balance",   { unit: "GST" }));
  const n_nodeAvailability = addNode(makeNode("outcome", "Node Availability", { unit: "%" }));
  const n_threatMitigation = addNode(makeNode("outcome", "Threat Mitigation", { unit: "incidents" }));
  const n_contractSafety  = addNode(makeNode("outcome", "Contract Safety",    { unit: "vulns-blocked" }));
  const n_networkHealth   = addNode(makeNode("outcome", "Network Health",     { unit: "score" }));

  // ── Domains ───────────────────────────────────────────────────────────────
  const n_domSecurity  = addNode(makeNode("domain", "Security Domain"));
  const n_domMarketing = addNode(makeNode("domain", "Marketing Domain"));
  const n_domInfra     = addNode(makeNode("domain", "Infrastructure Domain"));
  const n_domEconomy   = addNode(makeNode("domain", "Economy Domain"));
  const n_domGov       = addNode(makeNode("domain", "Governance Domain"));

  // ── Edges ─────────────────────────────────────────────────────────────────
  // Services ↔ agents
  addEdge(n_marketing,  n_strategist,   "controls",         0.90, "Marketing Engine delegates to strategist-agent");
  addEdge(n_revenue,    n_economy,      "controls",         0.90, "Revenue Engine delegates to economy-agent");
  addEdge(n_scaling,    n_operator,     "controls",         0.90, "Scaling Engine delegates to operator-agent");
  addEdge(n_are,        n_defender,     "controls",         0.85, "ARE coordinates defender-agent for threat response");
  addEdge(n_aiops,      n_auditor,      "controls",         0.85, "AIOps surfaces anomalies to auditor-agent");
  addEdge(n_gcl,        n_strategist,   "depends_on",       0.70, "GCL receives memory from all role agents");
  addEdge(n_gcl,        n_economy,      "depends_on",       0.70);
  addEdge(n_gcl,        n_operator,     "depends_on",       0.70);
  addEdge(n_gcl,        n_defender,     "depends_on",       0.70);
  addEdge(n_gcl,        n_auditor,      "depends_on",       0.70);
  addEdge(n_gcl,        n_architect,    "depends_on",       0.70);
  addEdge(n_gcl,        n_governance,   "depends_on",       0.70);

  // Agents → outcomes
  addEdge(n_strategist,  n_userGrowth,       "produces",       0.82, "Marketing campaigns → developer/user growth");
  addEdge(n_economy,     n_treasury,         "produces",       0.85, "Token burns/emissions → treasury balance");
  addEdge(n_operator,    n_nodeAvailability, "produces",       0.88, "Auto-scaling → node availability");
  addEdge(n_defender,    n_threatMitigation, "produces",       0.95, "DDoS blocking → threat mitigation");
  addEdge(n_auditor,     n_contractSafety,   "produces",       0.99, "Pre-deploy audit → blocking critical vulns");
  addEdge(n_architect,   n_networkHealth,    "produces",       0.80, "Shard design → overall network health");
  addEdge(n_governance,  n_treasury,         "correlates_with",0.65, "Governance proposals → validator costs");

  // Agent mitigations
  addEdge(n_defender, n_domSecurity,  "mitigates", 0.90, "defender-agent acts on security domain threats");
  addEdge(n_auditor,  n_domSecurity,  "mitigates", 0.95, "auditor-agent gates all security-critical deploys");
  addEdge(n_operator, n_domInfra,    "governs",   0.85, "operator-agent governs infra domain");
  addEdge(n_economy,  n_domEconomy,  "governs",   0.85, "economy-agent governs tokenomics domain");
  addEdge(n_governance, n_domGov,    "governs",   0.88, "governance-agent governs governance domain");
  addEdge(n_strategist, n_domMarketing, "governs",0.80, "strategist-agent governs marketing domain");

  // Cross-service funding
  addEdge(n_revenue,   n_treasury,    "funds",          0.80, "Revenue → treasury");
  addEdge(n_treasury,  n_marketing,   "funds",          0.60, "Treasury funds marketing campaigns");
  addEdge(n_treasury,  n_governance,  "funds",          0.55, "Treasury funds validator rewards via governance");
}

// ── Write (public) ────────────────────────────────────────────────────────────

export function addKnowledgeNode(
  type:       NodeType,
  label:      string,
  properties: Record<string, unknown> = {},
): KnowledgeNode {
  const node = makeNode(type, label, properties);
  _nodes.set(node.id, node);
  return node;
}

export function addKnowledgeEdge(
  fromId:   string,
  toId:     string,
  rel:      RelationType,
  weight:   number,
  desc?:    string,
): KnowledgeEdge | null {
  if (!_nodes.has(fromId) || !_nodes.has(toId)) return null;
  const edge: KnowledgeEdge = {
    id: uuid(), from: fromId, to: toId,
    relationship: rel, weight, timestamp: Date.now(), description: desc,
  };
  _edges.push(edge);
  return edge;
}

// ── Read ──────────────────────────────────────────────────────────────────────

export function getGraph(): { nodes: KnowledgeNode[]; edges: KnowledgeEdge[] } {
  return { nodes: [..._nodes.values()], edges: [..._edges] };
}

export function getNodesByType(type: NodeType): KnowledgeNode[] {
  return [..._nodes.values()].filter(n => n.type === type);
}

export function getRelationships(nodeId: string): {
  outgoing: KnowledgeEdge[];
  incoming: KnowledgeEdge[];
} {
  return {
    outgoing: _edges.filter(e => e.from === nodeId),
    incoming: _edges.filter(e => e.to   === nodeId),
  };
}

export function getGraphStats(): {
  totalNodes:     number;
  totalEdges:     number;
  nodesByType:    Record<string, number>;
  avgEdgeWeight:  number;
} {
  const nodesByType: Record<string, number> = {};
  for (const n of _nodes.values()) {
    nodesByType[n.type] = (nodesByType[n.type] ?? 0) + 1;
  }
  const avgWeight = _edges.length
    ? _edges.reduce((s, e) => s + e.weight, 0) / _edges.length
    : 0;

  return {
    totalNodes:    _nodes.size,
    totalEdges:    _edges.length,
    nodesByType,
    avgEdgeWeight: Math.round(avgWeight * 100) / 100,
  };
}
