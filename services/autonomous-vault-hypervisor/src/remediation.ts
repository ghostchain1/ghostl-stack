// remediation.ts — autonomous remediation engine
// Detects unhealthy VMs and containers and acts to restore them,
// subject to policy-gate checks and cooldown periods.

import { CFG }               from './config.js';
import { logger }            from './logger.js';
import { metrics }           from './metrics.js';
import { checkAction, maxAutoRestarts } from './policy-gate.js';
import { startVm, restartVm }           from './vm-manager.js';
import { startContainer, restartContainer } from './docker-manager.js';
import { publishAnomalySignal }         from './ghostbrain.js';
import type { RemediationEvent, ReconcileState } from './types.js';

// Track per-target cooldowns: targetKey -> last-remediation-timestamp
const cooldowns = new Map<string, number>();
// Track per-target remediation counts within a rolling window (1h)
const remediationCounts = new Map<string, { count: number; windowStart: number }>();

const ROLLING_WINDOW_MS = 3_600_000; // 1 hour

function canRemediate(targetKey: string, maxCount: number): boolean {
  const now = Date.now();

  // Cooldown check
  const lastAt = cooldowns.get(targetKey) ?? 0;
  if (now - lastAt < CFG.restartCooldownMs) return false;

  // Count-within-window check
  const entry = remediationCounts.get(targetKey) ?? { count: 0, windowStart: now };
  if (now - entry.windowStart > ROLLING_WINDOW_MS) {
    remediationCounts.set(targetKey, { count: 0, windowStart: now });
    return true;
  }
  return entry.count < maxCount;
}

function recordRemediation(targetKey: string): void {
  cooldowns.set(targetKey, Date.now());
  const now = Date.now();
  const entry = remediationCounts.get(targetKey) ?? { count: 0, windowStart: now };
  if (now - entry.windowStart > ROLLING_WINDOW_MS) {
    remediationCounts.set(targetKey, { count: 1, windowStart: now });
  } else {
    remediationCounts.set(targetKey, { count: entry.count + 1, windowStart: entry.windowStart });
  }
}

/** Inspect VMs in the state and auto-remediate crashed/shut-off ones */
export async function remediateVms(
  state: ReconcileState,
  executed: number,
): Promise<number> {
  if (!CFG.remediateEnabled) return executed;
  const { vms: maxVm } = maxAutoRestarts();

  for (const vm of state.vms.values()) {
    if (executed >= CFG.maxRemediationsPerRun) break;

    const shouldRemediate = vm.state === 'crashed' || vm.state === 'shut off';
    if (!shouldRemediate) continue;

    const key = `vm:${vm.name}`;
    if (!canRemediate(key, maxVm)) {
      logger.info('VM remediation skipped — cooldown or limit reached', { vm: vm.name });
      continue;
    }

    const gate = checkAction('vm.start', vm.name, vm.layer);
    if (!gate.allowed) {
      logger.warn('VM remediation policy-denied', { vm: vm.name, reason: gate.reason });
      const evt: RemediationEvent = { ts: Date.now(), type: 'vm_start', target: vm.name, reason: `state:${vm.state}`, outcome: 'policy_denied' };
      state.remediations.push(evt);
      if (state.remediations.length > 500) state.remediations.shift();
      continue;
    }

    logger.info('Auto-remediating VM', { vm: vm.name, state: vm.state });
    const result = vm.state === 'crashed'
      ? await restartVm(vm.name)
      : await startVm(vm.name);

    const outcome: RemediationEvent['outcome'] = result.ok ? 'success' : 'failed';
    const evt: RemediationEvent = {
      ts: Date.now(),
      type: vm.state === 'crashed' ? 'vm_restart' : 'vm_start',
      target: vm.name,
      reason: `state:${vm.state}`,
      outcome,
      details: { output: result.output.slice(0, 200) },
    };
    state.remediations.push(evt);
    if (state.remediations.length > 500) state.remediations.shift();

    if (result.ok) {
      metrics.vmRemediations++;
      executed++;
      recordRemediation(key);
      logger.info('VM remediation succeeded', { vm: vm.name });
    } else {
      logger.warn('VM remediation failed', { vm: vm.name, output: result.output.slice(0, 200) });
      publishAnomalySignal('vm.remediation.failed', 1, 0);
    }
  }
  return executed;
}

/** Inspect containers in the state and auto-remediate exited/dead/restarting ones */
export async function remediateContainers(
  state: ReconcileState,
  executed: number,
): Promise<number> {
  if (!CFG.remediateEnabled) return executed;
  const { containers: maxC } = maxAutoRestarts();

  for (const ct of state.containers.values()) {
    if (executed >= CFG.maxRemediationsPerRun) break;

    const shouldRemediate = ct.state === 'exited' || ct.state === 'dead';
    const restartingTooMuch = ct.state === 'restarting' && ct.restartCount > CFG.maxContainerRestarts;
    if (!shouldRemediate && !restartingTooMuch) continue;

    const key = `container:${ct.name}`;
    if (!canRemediate(key, maxC)) {
      logger.info('Container remediation skipped — cooldown or limit reached', { container: ct.name });
      continue;
    }

    const gate = checkAction('container.start', ct.name);
    if (!gate.allowed) {
      logger.warn('Container remediation policy-denied', { container: ct.name, reason: gate.reason });
      const evt: RemediationEvent = { ts: Date.now(), type: 'container_start', target: ct.name, reason: `state:${ct.state}`, outcome: 'policy_denied' };
      state.remediations.push(evt);
      if (state.remediations.length > 500) state.remediations.shift();
      continue;
    }

    logger.info('Auto-remediating container', { container: ct.name, state: ct.state, restartCount: ct.restartCount });

    let result: { ok: boolean; output: string };
    let evtType: RemediationEvent['type'];

    if (ct.state === 'exited' || ct.state === 'dead') {
      result   = await startContainer(ct.id);
      evtType  = 'container_start';
    } else {
      result   = await restartContainer(ct.id);
      evtType  = 'container_restart';
    }

    const outcome: RemediationEvent['outcome'] = result.ok ? 'success' : 'failed';
    const evt: RemediationEvent = {
      ts: Date.now(), type: evtType, target: ct.name,
      reason: `state:${ct.state},restarts:${ct.restartCount}`,
      outcome, details: { output: result.output.slice(0, 200) },
    };
    state.remediations.push(evt);
    if (state.remediations.length > 500) state.remediations.shift();

    if (result.ok) {
      metrics.containerRemediations++;
      executed++;
      recordRemediation(key);
      logger.info('Container remediation succeeded', { container: ct.name });
    } else {
      logger.warn('Container remediation failed', { container: ct.name, output: result.output.slice(0, 200) });
      publishAnomalySignal('container.remediation.failed', 1, 0);
    }
  }
  return executed;
}
