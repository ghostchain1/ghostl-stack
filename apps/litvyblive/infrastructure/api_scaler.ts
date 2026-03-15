/**
 * API Scaler — GhostBrain Infrastructure AI
 *
 * Monitors API server load and spawns/terminates containers automatically.
 *
 * Scale-UP triggers (any):
 *   • Requests per second              > RPS_SCALE_UP
 *   • Average API node CPU             > CPU_SCALE_UP_PCT
 *   • Active connections per node      > CONNECTIONS_PER_NODE_LIMIT
 *
 * Scale-DOWN triggers (all):
 *   • RPS < RPS_SCALE_DOWN
 *   • Average API CPU < CPU_SCALE_DOWN_PCT
 *   • Node count > MIN_NODES['api_node']
 */

import {
  addNode, drainAndRemoveNode, listNodes,
  hotestRegion, idlestNode,
  type Region,
} from './cluster_manager.js';
import { getDb } from '../backend/src/db/index.js';
import { v4 as uuidv4 } from 'uuid';

// ── Thresholds ─────────────────────────────────────────────────────────────────

const RPS_SCALE_UP              = 1_000;
const RPS_SCALE_DOWN            = 200;
const CPU_SCALE_UP_PCT          = 70;
const CPU_SCALE_DOWN_PCT        = 20;
const CONNECTIONS_PER_NODE_LIMIT = 500;
const SCALE_DOWN_CONN_RATIO     = 0.25;

// ── Evaluation ─────────────────────────────────────────────────────────────────

export interface ApiCapacityReport {
  apiNodes:           number;
  currentRps:         number;
  connectionsPerNode: number;
  averageCpuPct:      number;
  recommendation:     'scale_up' | 'scale_down' | 'ok';
  targetRegion?:      Region;
  reason:             string;
}

export function evaluateApiCapacity(currentRps: number): ApiCapacityReport {
  const nodes = listNodes({ type: 'api_node', status: 'healthy' });
  const n     = nodes.length || 1;

  const totalConns    = nodes.reduce((s, x) => s + x.connections, 0);
  const connsPerNode  = totalConns / n;
  const avgCpu        = nodes.reduce((s, x) => s + x.cpuPct, 0) / n;

  let recommendation: ApiCapacityReport['recommendation'] = 'ok';
  let reason = 'api load nominal';

  if (
    currentRps  > RPS_SCALE_UP             ||
    avgCpu       > CPU_SCALE_UP_PCT         ||
    connsPerNode > CONNECTIONS_PER_NODE_LIMIT
  ) {
    recommendation = 'scale_up';
    reason = [
      currentRps  > RPS_SCALE_UP             && `rps=${currentRps} > ${RPS_SCALE_UP}`,
      avgCpu       > CPU_SCALE_UP_PCT         && `avgCPU=${avgCpu.toFixed(1)}% > ${CPU_SCALE_UP_PCT}%`,
      connsPerNode > CONNECTIONS_PER_NODE_LIMIT && `conns/node=${connsPerNode.toFixed(0)} > ${CONNECTIONS_PER_NODE_LIMIT}`,
    ].filter(Boolean).join('; ');
  } else if (
    currentRps  < RPS_SCALE_DOWN &&
    avgCpu       < CPU_SCALE_DOWN_PCT &&
    connsPerNode < CONNECTIONS_PER_NODE_LIMIT * SCALE_DOWN_CONN_RATIO &&
    nodes.length > 2
  ) {
    recommendation = 'scale_down';
    reason         = `low api load: rps=${currentRps}, cpu=${avgCpu.toFixed(1)}%, conns/node=${connsPerNode.toFixed(0)}`;
  }

  return {
    apiNodes:           nodes.length,
    currentRps,
    connectionsPerNode: parseFloat(connsPerNode.toFixed(0)),
    averageCpuPct:      parseFloat(avgCpu.toFixed(1)),
    recommendation,
    targetRegion:       recommendation === 'scale_up' ? hotestRegion('api_node') : undefined,
    reason,
  };
}

// ── Scale actions ──────────────────────────────────────────────────────────────

/**
 * Spawn a new API container in the highest-load region.
 * In production this would call the container orchestrator (K8s/Nomad).
 */
export function spawnApiContainer(region?: Region): string {
  const targetRegion = region ?? hotestRegion('api_node');
  const node = addNode('api_node', targetRegion);
  _recordApiScaleEvent('scale_up', node.nodeId, targetRegion,
    `Spawned litvyblive-api container in ${targetRegion}`);
  return node.nodeId;
}

/**
 * Terminate the lowest-utilization API node.
 */
export function terminateIdleApiNode(): string | null {
  const idle = idlestNode('api_node');
  if (!idle) return null;
  drainAndRemoveNode(idle.nodeId, 'Low API utilisation — auto scale-down');
  _recordApiScaleEvent('scale_down', idle.nodeId, idle.region,
    `Terminated idle api_node in ${idle.region}`);
  return idle.nodeId;
}

// ── Request rate estimation ────────────────────────────────────────────────────

/**
 * Compute the actual RPS from the api_request_log table over the last 10 seconds.
 * Returns 0 if the table doesn't exist (graceful degradation).
 */
export function getCurrentRps(): number {
  try {
    const db  = getDb();
    const row = db.prepare(`
      SELECT COUNT(*) AS n FROM api_request_log
      WHERE logged_at >= datetime('now', '-10 seconds')
    `).get() as any;
    return (row?.n ?? 0) / 10; // per-second rate
  } catch { return 0; }
}

// ── Internal ───────────────────────────────────────────────────────────────────

function _recordApiScaleEvent(
  action: 'scale_up' | 'scale_down',
  nodeId: string,
  region: Region,
  reason: string,
): void {
  getDb().prepare(`
    INSERT INTO scaling_decisions
      (decision_id, node_type, action, node_id, region, reason, decided_at)
    VALUES (?, 'api_node', ?, ?, ?, ?, ?)
  `).run(uuidv4(), action, nodeId, region, reason, new Date().toISOString());
}
