// reconciler.ts — main autonomous reconciliation loop
// Runs on a configurable interval, discovers VMs and containers,
// auto-remediates unhealthy ones, and rotates secrets per schedule.
import { randomUUID } from 'node:crypto';
import { CFG } from './config.js';
import { logger } from './logger.js';
import { metrics } from './metrics.js';
import { discoverVms } from './vm-manager.js';
import { discoverContainers } from './docker-manager.js';
import { remediateVms, remediateContainers } from './remediation.js';
import { rotateSecret } from './vault-client.js';
import { getRotations, markRotated } from './policy-gate.js';
import { publishHealthSignal, publishAnomalySignal } from './ghostbrain.js';
import type { ReconcilerState } from './types.js';

export const state: ReconcilerState = {
  vms: new Map(),
  containers: new Map(),
  lastReconciled: 0,
  lastVmDiscovery: 0,
  lastContainerDiscovery: 0,
  remediations: [],
};

let _timer: ReturnType<typeof setInterval> | null = null;
let _running = false;

async function discoverPhase(): Promise<void> {
  // VM discovery
  try {
    const vms = await discoverVms();
    state.vms.clear();
    for (const vm of vms) state.vms.set(vm.name, vm);
    state.lastVmDiscovery = Date.now();
    metrics.vmDiscoveries++;
    logger.debug('VM discovery complete', { count: vms.length });
  } catch (err) {
    logger.warn('VM discovery failed', { err: String(err) });
  }
  // Container discovery
  if (CFG.dockerEnabled) {
    try {
      const containers = await discoverContainers();
      state.containers.clear();
      for (const c of containers) state.containers.set(c.id, c);
      state.lastContainerDiscovery = Date.now();
      metrics.containerDiscoveries++;
      logger.debug('Container discovery complete', { count: containers.length });
    } catch (err) {
      logger.warn('Container discovery failed', { err: String(err) });
    }
  }
}

async function remediatePhase(): Promise<void> {
  let executed = 0;
  executed = await remediateVms(state, executed);
  executed = await remediateContainers(state, executed);
  if (executed > 0) logger.info('Remediation phase complete', { executed });
}

async function rotationPhase(): Promise<void> {
  if (!CFG.rotateEnabled) return;
  const rotations = getRotations();
  for (let i = 0; i < rotations.length; i++) {
    const rule = rotations[i];
    const last = rule._lastRotated ?? 0;
    const intervalMs = (rule.intervalMinutes ?? 60) * 60_000;
    if (Date.now() - last < intervalMs) continue;

    logger.info('Rotating secret', { mount: rule.mount, path: rule.path });
    const result = await rotateSecret({
      mount: rule.mount,
      path: rule.path,
      kvVersion: rule.kvVersion,
      keys: rule.keys,
      encoding: rule.encoding,
    });
    if (result.ok) {
      metrics.secretRotations++;
      markRotated(i);
      logger.info('Secret rotation succeeded', { mount: rule.mount, path: rule.path, rotated: result.rotated });
    } else {
      metrics.secretRotationFails++;
      logger.warn('Secret rotation failed', { mount: rule.mount, path: rule.path, reason: result.reason });
      publishAnomalySignal('secret.rotation.failed', 1, 0);
    }
  }
}

async function runOnce(): Promise<void> {
  if (_running) {
    logger.debug('Reconcile already running — skipping cycle');
    return;
  }
  _running = true;
  const start = Date.now();
  try {
    logger.debug('Reconcile cycle start');
    await discoverPhase();
    await remediatePhase();
    await rotationPhase();
    state.lastReconciled = Date.now();
    metrics.reconcileRuns++;
    const durationMs = Date.now() - start;
    logger.debug('Reconcile cycle complete', { durationMs });
    publishHealthSignal({
      signalId: randomUUID(),
      source: 'manual',
      service: CFG.serviceName,
      layer: 'L1',
      metric: 'reconcile.duration_ms',
      value: durationMs,
      observedAt: new Date().toISOString(),
      anomaly: false,
    });
  } catch (err) {
    logger.error('Reconcile cycle fatal error', { err: String(err) });
    publishAnomalySignal('reconcile.fatal_error', 1, 0);
  } finally {
    _running = false;
  }
}

export function startReconciler(): void {
  if (_timer) return;
  logger.info('Reconciler starting', { intervalMs: CFG.reconcileIntervalMs });
  void runOnce();
  _timer = setInterval(() => void runOnce(), CFG.reconcileIntervalMs);
  _timer.unref();
}

export function stopReconciler(): void {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}

/** Trigger an immediate reconcile run (for API-driven requests) */
export async function triggerReconcile(): Promise<void> {
  await runOnce();
}
