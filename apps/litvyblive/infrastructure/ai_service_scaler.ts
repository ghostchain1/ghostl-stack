/**
 * AI Service Scaler — GhostBrain Infrastructure AI
 *
 * Scales compute workers for the four AI service categories:
 *   matchmaking   — PK/battle matchmaking, event seeding
 *   moderation    — real-time chat/stream content moderation
 *   marketing     — ad targeting, creator recommendations
 *   fraud         — GhostBrain Defender inference queue
 *
 * Workers share the same `ai_worker` node type in the cluster manager.
 * Each worker is tagged with its `service` label.
 *
 * Scale-UP triggers (per service):
 *   • Inference queue depth     > QUEUE_SCALE_UP_DEPTH
 *   • Average processing latency > LATENCY_SCALE_UP_MS
 *
 * Scale-DOWN triggers (all):
 *   • Queue depth               < QUEUE_SCALE_DOWN_DEPTH
 *   • Worker count for service  > 1
 */

import {
  addNode, drainAndRemoveNode, listNodes, hotestRegion, type Region,
} from './cluster_manager.js';
import { getDb } from '../backend/src/db/index.js';
import { v4 as uuidv4 } from 'uuid';

// ── Types ──────────────────────────────────────────────────────────────────────

export type AIServiceType = 'matchmaking' | 'moderation' | 'marketing' | 'fraud';

export interface AIServiceStatus {
  service:         AIServiceType;
  workers:         number;
  queueDepth:      number;
  avgLatencyMs:    number;
  recommendation:  'scale_up' | 'scale_down' | 'ok';
  reason:          string;
}

// ── Thresholds ─────────────────────────────────────────────────────────────────

const QUEUE_SCALE_UP_DEPTH   = 50;     // jobs waiting
const QUEUE_SCALE_DOWN_DEPTH = 5;
const LATENCY_SCALE_UP_MS    = 2_000;  // 2 s p95 latency
const MIN_WORKERS_PER_SERVICE = 1;

// ── In-process queue simulation ───────────────────────────────────────────────

// In production these would be pulled from BullMQ / Redis
const _queueDepths  = new Map<AIServiceType, number>([
  ['matchmaking', 0], ['moderation', 0], ['marketing', 0], ['fraud', 0],
]);
const _latencies    = new Map<AIServiceType, number>([
  ['matchmaking', 0], ['moderation', 0], ['marketing', 0], ['fraud', 0],
]);

/** Called from the GhostBrain bridge to update live queue telemetry. */
export function updateAIServiceTelemetry(service: AIServiceType, queueDepth: number, avgLatencyMs: number): void {
  _queueDepths.set(service, queueDepth);
  _latencies.set(service, avgLatencyMs);
  _persistTelemetry(service, queueDepth, avgLatencyMs);
}

// ── Evaluation ─────────────────────────────────────────────────────────────────

export function evaluateAIService(service: AIServiceType): AIServiceStatus {
  const workers    = _countWorkersForService(service);
  const queueDepth = _queueDepths.get(service) ?? 0;
  const avgLatency = _latencies.get(service) ?? 0;

  let recommendation: AIServiceStatus['recommendation'] = 'ok';
  let reason = 'ai service nominal';

  if (queueDepth > QUEUE_SCALE_UP_DEPTH || avgLatency > LATENCY_SCALE_UP_MS) {
    recommendation = 'scale_up';
    reason = [
      queueDepth > QUEUE_SCALE_UP_DEPTH  && `queue=${queueDepth} > ${QUEUE_SCALE_UP_DEPTH}`,
      avgLatency > LATENCY_SCALE_UP_MS   && `latency=${avgLatency}ms > ${LATENCY_SCALE_UP_MS}ms`,
    ].filter(Boolean).join('; ');
  } else if (
    queueDepth < QUEUE_SCALE_DOWN_DEPTH &&
    workers    > MIN_WORKERS_PER_SERVICE
  ) {
    recommendation = 'scale_down';
    reason         = `idle ai service: queue=${queueDepth}, workers=${workers}`;
  }

  return { service, workers, queueDepth, avgLatencyMs: avgLatency, recommendation, reason };
}

export function evaluateAllAIServices(): AIServiceStatus[] {
  const services: AIServiceType[] = ['matchmaking', 'moderation', 'marketing', 'fraud'];
  return services.map(evaluateAIService);
}

// ── Scale actions ──────────────────────────────────────────────────────────────

/**
 * Deploy an additional AI worker for the given service.
 * Returns the new nodeId.
 */
export function deployAIWorker(service: AIServiceType, region?: Region): string {
  const targetRegion = region ?? hotestRegion('ai_worker');
  const node = addNode('ai_worker', targetRegion);

  // Tag node with service label in DB
  getDb().prepare(`
    UPDATE infrastructure_nodes SET service_label = ? WHERE node_id = ?
  `).run(service, node.nodeId);

  _recordAIScaleEvent('scale_up', service, node.nodeId, targetRegion,
    `Deployed ai_worker (${service}) in ${targetRegion}`);
  return node.nodeId;
}

/**
 * Remove the oldest idle AI worker for the given service.
 */
export function scaleDownAIWorker(service: AIServiceType): string | null {
  const workers = _getWorkerNodes(service);
  if (workers.length <= MIN_WORKERS_PER_SERVICE) return null;

  // Pick the one with the lowest CPU
  const candidate = workers.sort((a, b) => a.cpuPct - b.cpuPct)[0];
  drainAndRemoveNode(candidate.nodeId, `Scale-down: ${service} queue low`);
  _recordAIScaleEvent('scale_down', service, candidate.nodeId, candidate.region,
    `Drained idle ai_worker (${service}) in ${candidate.region}`);
  return candidate.nodeId;
}

// ── Queries ────────────────────────────────────────────────────────────────────

export function getAIServiceSummary(): Record<AIServiceType, { workers: number; queueDepth: number }> {
  const services: AIServiceType[] = ['matchmaking', 'moderation', 'marketing', 'fraud'];
  return Object.fromEntries(
    services.map(s => [s, {
      workers:    _countWorkersForService(s),
      queueDepth: _queueDepths.get(s) ?? 0,
    }])
  ) as Record<AIServiceType, { workers: number; queueDepth: number }>;
}

// ── Internal ───────────────────────────────────────────────────────────────────

function _getWorkerNodes(service: AIServiceType) {
  // Filter ai_worker nodes by service label stored in the cache enriched from DB
  const db   = getDb();
  const rows = db.prepare(`
    SELECT node_id FROM infrastructure_nodes
    WHERE type = 'ai_worker' AND status = 'healthy' AND service_label = ?
  `).all(service) as any[];
  const ids = new Set(rows.map(r => r.node_id));
  return listNodes({ type: 'ai_worker', status: 'healthy' }).filter(n => ids.has(n.nodeId));
}

function _countWorkersForService(service: AIServiceType): number {
  return _getWorkerNodes(service).length;
}

function _persistTelemetry(service: AIServiceType, queueDepth: number, avgLatencyMs: number): void {
  try {
    getDb().prepare(`
      INSERT INTO ai_service_telemetry
        (telemetry_id, service, queue_depth, avg_latency_ms, recorded_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(uuidv4(), service, queueDepth, avgLatencyMs, new Date().toISOString());
  } catch { /* table may not exist in test env */ }
}

function _recordAIScaleEvent(
  action:  'scale_up' | 'scale_down',
  service: AIServiceType,
  nodeId:  string,
  region:  Region,
  reason:  string,
): void {
  getDb().prepare(`
    INSERT INTO scaling_decisions
      (decision_id, node_type, action, node_id, region, reason, decided_at)
    VALUES (?, 'ai_worker', ?, ?, ?, ?, ?)
  `).run(uuidv4(), action, nodeId, region, reason, new Date().toISOString());
}
