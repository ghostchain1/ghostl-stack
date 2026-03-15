/**
 * AutoScale Controller — GhostBrain Infrastructure AI
 *
 * The central feedback loop that ties together load monitoring, cluster
 * management, and the three domain scalers (streaming, API, AI).
 *
 * Control loop (runs every CONTROL_LOOP_INTERVAL_MS):
 *   1. Read latest platform metrics from load_monitor
 *   2. Evaluate pressure level (normal / elevated / high / critical)
 *   3. For each resource domain: evaluate capacity → apply recommendation
 *   4. Persist the scaling decision to `scaling_decisions`
 *   5. Cooldown guard — same resource cannot be actioned twice in COOLDOWN_MS
 *
 * All scaling actions are non-destructive:
 *   scale-up  → add one node per loop tick (prevents over-provisioning)
 *   scale-down → drain one idle node per loop tick
 *
 * High-level state is exposed via `getControllerStatus()` for the admin API.
 */

import { getDb } from '../backend/src/db/index.js';
import { v4 as uuidv4 } from 'uuid';
import {
  getLatestMetrics, evaluatePressure, startMonitoring, stopMonitoring,
  type PlatformMetrics, type PressureLevel,
} from './load_monitor.js';
import { initCluster, getClusterSnapshot, getScalingHistory } from './cluster_manager.js';
import { evaluateStreamingCapacity, deployStreamingNode, removeIdleStreamingNode } from './streaming_scaler.js';
import { evaluateApiCapacity, spawnApiContainer, terminateIdleApiNode, getCurrentRps } from './api_scaler.js';
import { evaluateAllAIServices, deployAIWorker, scaleDownAIWorker, type AIServiceType } from './ai_service_scaler.js';

// ── Constants ──────────────────────────────────────────────────────────────────

const CONTROL_LOOP_INTERVAL_MS = 15_000;  // evaluate every 15 s
const COOLDOWN_MS              = 60_000;  // minimum between scaling the same type
const MAX_SCALE_UPS_PER_TICK   = 2;       // at most 2 new nodes per loop iteration

// ── State ──────────────────────────────────────────────────────────────────────

let _loopTimer:     ReturnType<typeof setInterval> | null = null;
let _running        = false;
let _loopCount      = 0;
let _lastDecisionAt = new Map<string, number>(); // nodeType → timestamp

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Start the auto-scale control loop.
 * Also starts the load monitor and initialises the cluster registry.
 */
export function startControlLoop(): void {
  if (_running) return;
  _running = true;

  initCluster();
  startMonitoring();

  _loopTimer = setInterval(_runControlTick, CONTROL_LOOP_INTERVAL_MS);
  // Immediate first tick
  setImmediate(() => _runControlTick());
  process.stderr.write('[autoscale] Control loop started\n');
}

/** Stop all auto-scaling activity. */
export function stopControlLoop(): void {
  if (!_running) return;
  _running = false;
  if (_loopTimer) { clearInterval(_loopTimer); _loopTimer = null; }
  stopMonitoring();
  process.stderr.write('[autoscale] Control loop stopped\n');
}

export function isRunning(): boolean { return _running; }
export function getLoopCount(): number { return _loopCount; }

// ── Status ─────────────────────────────────────────────────────────────────────

export interface ControllerStatus {
  running:         boolean;
  loopCount:       number;
  currentPressure: PressureLevel | null;
  latestMetrics:   PlatformMetrics | null;
  cluster:         ReturnType<typeof getClusterSnapshot>;
  streaming:       ReturnType<typeof evaluateStreamingCapacity>;
  api:             ReturnType<typeof evaluateApiCapacity>;
  ai:              ReturnType<typeof evaluateAllAIServices>;
  recentDecisions: any[];
}

export function getControllerStatus(): ControllerStatus {
  const metrics     = getLatestMetrics();
  const pressure    = metrics ? evaluatePressure(metrics).level : null;
  const currentRps  = getCurrentRps();

  return {
    running:         _running,
    loopCount:       _loopCount,
    currentPressure: pressure,
    latestMetrics:   metrics,
    cluster:         getClusterSnapshot(),
    streaming:       evaluateStreamingCapacity(),
    api:             evaluateApiCapacity(currentRps),
    ai:              evaluateAllAIServices(),
    recentDecisions: getScalingHistory(20),
  };
}

// ── Control tick ───────────────────────────────────────────────────────────────

async function _runControlTick(): Promise<void> {
  if (!_running) return;
  _loopCount++;

  try {
    const metrics = getLatestMetrics();
    if (!metrics) return; // not enough data yet

    const pressureReport = evaluatePressure(metrics);
    const pressure       = pressureReport.level;

    let scaleUpsThisTick = 0;

    // ── Streaming ────────────────────────────────────────────────────────────
    if (scaleUpsThisTick < MAX_SCALE_UPS_PER_TICK) {
      const streaming = evaluateStreamingCapacity();
      if (streaming.recommendation === 'scale_up' && _canAct('streaming_node')) {
        deployStreamingNode(streaming.recommendedTargetRegion);
        _markActed('streaming_node');
        scaleUpsThisTick++;
        _persistDecision('streaming_node', 'scale_up', streaming.reason, pressure);
      } else if (streaming.recommendation === 'scale_down' && _canAct('streaming_node')) {
        const removed = removeIdleStreamingNode();
        if (removed) {
          _markActed('streaming_node');
          _persistDecision('streaming_node', 'scale_down', streaming.reason, pressure);
        }
      }
    }

    // ── API ──────────────────────────────────────────────────────────────────
    if (scaleUpsThisTick < MAX_SCALE_UPS_PER_TICK) {
      const rps = getCurrentRps();
      const api = evaluateApiCapacity(rps);
      if (api.recommendation === 'scale_up' && _canAct('api_node')) {
        spawnApiContainer(api.targetRegion);
        _markActed('api_node');
        scaleUpsThisTick++;
        _persistDecision('api_node', 'scale_up', api.reason, pressure);
      } else if (api.recommendation === 'scale_down' && _canAct('api_node')) {
        const removed = terminateIdleApiNode();
        if (removed) {
          _markActed('api_node');
          _persistDecision('api_node', 'scale_down', api.reason, pressure);
        }
      }
    }

    // ── AI Services ──────────────────────────────────────────────────────────
    for (const svc of evaluateAllAIServices()) {
      if (scaleUpsThisTick >= MAX_SCALE_UPS_PER_TICK) break;
      const key = `ai_worker:${svc.service}`;
      if (svc.recommendation === 'scale_up' && _canAct(key)) {
        deployAIWorker(svc.service as AIServiceType);
        _markActed(key);
        scaleUpsThisTick++;
        _persistDecision('ai_worker', 'scale_up', `${svc.service}: ${svc.reason}`, pressure);
      } else if (svc.recommendation === 'scale_down' && _canAct(key)) {
        const removed = scaleDownAIWorker(svc.service as AIServiceType);
        if (removed) {
          _markActed(key);
          _persistDecision('ai_worker', 'scale_down', `${svc.service}: ${svc.reason}`, pressure);
        }
      }
    }

  } catch (e) {
    process.stderr.write(`[autoscale] Tick error: ${(e as Error).message}\n`);
  }
}

// ── Cooldown tracking ──────────────────────────────────────────────────────────

function _canAct(resourceKey: string): boolean {
  const last = _lastDecisionAt.get(resourceKey) ?? 0;
  return Date.now() - last >= COOLDOWN_MS;
}

function _markActed(resourceKey: string): void {
  _lastDecisionAt.set(resourceKey, Date.now());
}

// ── Persistence ────────────────────────────────────────────────────────────────

function _persistDecision(
  nodeType: string,
  action:   'scale_up' | 'scale_down',
  reason:   string,
  pressure: PressureLevel,
): void {
  try {
    getDb().prepare(`
      INSERT INTO scaling_decisions
        (decision_id, node_type, action, node_id, region, reason, pressure_level, decided_at)
      VALUES (?, ?, ?, NULL, NULL, ?, ?, ?)
    `).run(uuidv4(), nodeType, action, reason, pressure, new Date().toISOString());
  } catch { /* non-fatal */ }
}
