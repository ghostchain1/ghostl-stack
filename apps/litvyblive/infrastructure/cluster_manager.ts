/**
 * Cluster Manager — GhostBrain Infrastructure AI
 *
 * Maintains the live registry of all infrastructure nodes across:
 *   streaming_node | api_node | ai_worker | db_replica | redis_replica
 *
 * Nodes are stored in SQLite (`infrastructure_nodes`) and mirrored to an
 * in-process Map for O(1) reads by the scalers and load balancer.
 *
 * Region model: US_EAST | US_WEST | EU_WEST | APAC
 * Traffic affinity: viewers are routed to the nearest healthy region.
 */

import { getDb } from '../backend/src/db/index.js';
import { v4 as uuidv4 } from 'uuid';

// ── Types ──────────────────────────────────────────────────────────────────────

export type NodeType     = 'streaming_node' | 'api_node' | 'ai_worker' | 'db_replica' | 'redis_replica';
export type NodeStatus   = 'provisioning' | 'healthy' | 'draining' | 'terminated';
export type Region       = 'US_EAST' | 'US_WEST' | 'EU_WEST' | 'APAC';

export interface ClusterNode {
  nodeId:       string;
  type:         NodeType;
  region:       Region;
  status:       NodeStatus;
  cpuPct:       number;     // last reported CPU %
  memoryMb:     number;     // last reported used RAM MB
  activeStreams: number;     // only meaningful for streaming_node
  connections:  number;     // active connections / requests
  provisionedAt: string;
  lastHeartbeat: string;
}

export interface ClusterSnapshot {
  totalNodes:       number;
  byType:           Record<NodeType, number>;
  byRegion:         Record<Region, number>;
  healthyNodes:     number;
  drainingNodes:    number;
  averageCpuPct:    number;
  streamingCapacity: number; // total active streams across streaming_nodes
  apiCapacity:      number;  // active connections across api_nodes
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const REGIONS: Region[]    = ['US_EAST', 'US_WEST', 'EU_WEST', 'APAC'];
export const NODE_TYPES: NodeType[] = ['streaming_node', 'api_node', 'ai_worker', 'db_replica', 'redis_replica'];

// Minimum healthy nodes per type (never scale below these)
export const MIN_NODES: Record<NodeType, number> = {
  streaming_node: 2,
  api_node:       2,
  ai_worker:      1,
  db_replica:     1,
  redis_replica:  1,
};

// In-process node cache
const _nodeCache = new Map<string, ClusterNode>();
let _cacheLoaded = false;

// ── Initialisation ─────────────────────────────────────────────────────────────

/** Load node state from DB into the in-process cache. Call once at startup. */
export function initCluster(): void {
  if (_cacheLoaded) return;
  const db   = getDb();
  const rows = db.prepare(`SELECT * FROM infrastructure_nodes WHERE status != 'terminated'`).all() as any[];
  for (const r of rows) _nodeCache.set(r.node_id, _rowToNode(r));
  _cacheLoaded = true;

  // Seed minimum nodes for each type/region if DB is empty
  for (const type of NODE_TYPES) {
    const count = _countByType(type);
    if (count < MIN_NODES[type]) {
      for (let i = count; i < MIN_NODES[type]; i++) {
        addNode(type, 'US_EAST'); // default seed region
      }
    }
  }
}

// ── CRUD operations ────────────────────────────────────────────────────────────

/**
 * Provision a new node of the given type in the specified region.
 * Returns the new node record.
 */
export function addNode(type: NodeType, region: Region): ClusterNode {
  const db   = getDb();
  const now  = new Date().toISOString();
  const node: ClusterNode = {
    nodeId:        uuidv4(),
    type,
    region,
    status:        'provisioning',
    cpuPct:        0,
    memoryMb:      0,
    activeStreams:  0,
    connections:   0,
    provisionedAt: now,
    lastHeartbeat: now,
  };

  db.prepare(`
    INSERT INTO infrastructure_nodes
      (node_id, type, region, status, cpu_pct, memory_mb, active_streams,
       connections, provisioned_at, last_heartbeat)
    VALUES (?, ?, ?, 'provisioning', 0, 0, 0, 0, ?, ?)
  `).run(node.nodeId, type, region, now, now);

  _nodeCache.set(node.nodeId, node);

  _logScalingEvent('scale_up', type, region, node.nodeId, `Provisioned new ${type}`);
  return node;
}

/**
 * Mark a node as draining (stops receiving new connections),
 * then terminate it after a grace period.
 */
export function drainAndRemoveNode(nodeId: string, reason: string): void {
  const node = _nodeCache.get(nodeId);
  if (!node) return;

  // Enforce minimum node count
  const healthy = listNodes({ type: node.type, status: 'healthy' });
  if (healthy.length <= MIN_NODES[node.type]) {
    throw new Error(`Cannot remove ${node.type}: would drop below minimum (${MIN_NODES[node.type]})`);
  }

  _updateNodeStatus(nodeId, 'draining');
  _logScalingEvent('scale_down', node.type, node.region, nodeId, reason);

  // Terminate after 30-second drain window
  setTimeout(() => _terminateNode(nodeId), 30_000);
}

/**
 * Update telemetry for a node (called from heartbeat handler).
 */
export function updateNodeTelemetry(
  nodeId: string,
  telemetry: { cpuPct: number; memoryMb: number; activeStreams?: number; connections?: number },
): void {
  const node = _nodeCache.get(nodeId);
  if (!node) return;

  const now = new Date().toISOString();
  Object.assign(node, {
    cpuPct:       telemetry.cpuPct,
    memoryMb:     telemetry.memoryMb,
    activeStreams: telemetry.activeStreams ?? node.activeStreams,
    connections:  telemetry.connections  ?? node.connections,
    lastHeartbeat: now,
    status:       node.status === 'provisioning' ? 'healthy' : node.status,
  });

  getDb().prepare(`
    UPDATE infrastructure_nodes
    SET cpu_pct = ?, memory_mb = ?, active_streams = ?, connections = ?,
        last_heartbeat = ?, status = ?
    WHERE node_id = ?
  `).run(node.cpuPct, node.memoryMb, node.activeStreams,
         node.connections, now, node.status, nodeId);
}

// ── Queries ────────────────────────────────────────────────────────────────────

export function listNodes(filters: {
  type?:   NodeType;
  region?: Region;
  status?: NodeStatus;
} = {}): ClusterNode[] {
  let nodes = [..._nodeCache.values()];
  if (filters.type)   nodes = nodes.filter(n => n.type   === filters.type);
  if (filters.region) nodes = nodes.filter(n => n.region === filters.region);
  if (filters.status) nodes = nodes.filter(n => n.status === filters.status);
  return nodes;
}

export function getNode(nodeId: string): ClusterNode | undefined {
  return _nodeCache.get(nodeId);
}

export function getClusterSnapshot(): ClusterSnapshot {
  const all     = [..._nodeCache.values()].filter(n => n.status !== 'terminated');
  const healthy = all.filter(n => n.status === 'healthy');

  const byType   = Object.fromEntries(NODE_TYPES.map(t => [t, 0])) as Record<NodeType, number>;
  const byRegion = Object.fromEntries(REGIONS.map(r => [r, 0])) as Record<Region, number>;
  for (const n of all) { byType[n.type]++; byRegion[n.region]++; }

  const avgCpu = healthy.length
    ? healthy.reduce((s, n) => s + n.cpuPct, 0) / healthy.length
    : 0;

  return {
    totalNodes:       all.length,
    byType,
    byRegion,
    healthyNodes:     healthy.length,
    drainingNodes:    all.filter(n => n.status === 'draining').length,
    averageCpuPct:    parseFloat(avgCpu.toFixed(1)),
    streamingCapacity: all.filter(n => n.type === 'streaming_node').reduce((s, n) => s + n.activeStreams, 0),
    apiCapacity:      all.filter(n => n.type === 'api_node').reduce((s, n) => s + n.connections, 0),
  };
}

/**
 * Select the highest-load region to deploy new capacity into.
 * Falls back to US_EAST if no data.
 */
export function hotestRegion(type: NodeType): Region {
  let maxCpu = -1;
  let best: Region = 'US_EAST';
  for (const r of REGIONS) {
    const nodes = listNodes({ type, region: r, status: 'healthy' });
    const avg   = nodes.length ? nodes.reduce((s, n) => s + n.cpuPct, 0) / nodes.length : 0;
    if (avg > maxCpu) { maxCpu = avg; best = r; }
  }
  return best;
}

/**
 * Select the lowest-load node for graceful scale-down.
 * Returns undefined if no safe candidate exists.
 */
export function idlestNode(type: NodeType): ClusterNode | undefined {
  const candidates = listNodes({ type, status: 'healthy' });
  if (candidates.length <= MIN_NODES[type]) return undefined;
  return candidates.sort((a, b) => a.cpuPct - b.cpuPct)[0];
}

// ── Rebalancing ────────────────────────────────────────────────────────────────

/**
 * Mark all provisioning nodes as healthy (simulates the node joining the cluster).
 * In production this is driven by the node's own heartbeat.
 */
export function promoteProvisioningNodes(): void {
  const db  = getDb();
  const now = new Date().toISOString();
  for (const [id, node] of _nodeCache) {
    if (node.status === 'provisioning') {
      node.status        = 'healthy';
      node.lastHeartbeat = now;
      db.prepare(`UPDATE infrastructure_nodes SET status = 'healthy', last_heartbeat = ? WHERE node_id = ?`).run(now, id);
    }
  }
}

// ── Scaling event log ──────────────────────────────────────────────────────────

export function getScalingHistory(limit = 50): any[] {
  return getDb().prepare(`
    SELECT * FROM scaling_events ORDER BY occurred_at DESC LIMIT ?
  `).all(limit) as any[];
}

// ── Internal helpers ───────────────────────────────────────────────────────────

function _terminateNode(nodeId: string): void {
  _nodeCache.delete(nodeId);
  getDb().prepare(`
    UPDATE infrastructure_nodes SET status = 'terminated' WHERE node_id = ?
  `).run(nodeId);
}

function _updateNodeStatus(nodeId: string, status: NodeStatus): void {
  const node = _nodeCache.get(nodeId);
  if (!node) return;
  node.status = status;
  getDb().prepare(`UPDATE infrastructure_nodes SET status = ? WHERE node_id = ?`).run(status, nodeId);
}

function _countByType(type: NodeType): number {
  return [..._nodeCache.values()].filter(n => n.type === type && n.status !== 'terminated').length;
}

function _logScalingEvent(
  action:  'scale_up' | 'scale_down',
  type:    NodeType,
  region:  Region,
  nodeId:  string,
  reason:  string,
): void {
  getDb().prepare(`
    INSERT INTO scaling_events (event_id, action, node_type, region, node_id, reason, occurred_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), action, type, region, nodeId, reason, new Date().toISOString());
}

function _rowToNode(r: any): ClusterNode {
  return {
    nodeId:        r.node_id,
    type:          r.type,
    region:        r.region,
    status:        r.status,
    cpuPct:        r.cpu_pct,
    memoryMb:      r.memory_mb,
    activeStreams:  r.active_streams,
    connections:   r.connections,
    provisionedAt: r.provisioned_at,
    lastHeartbeat: r.last_heartbeat,
  };
}
