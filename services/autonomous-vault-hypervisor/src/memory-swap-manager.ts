// memory-swap-manager.ts — AI-powered autonomous memory swap system
//
// Monitors per-workload memory pressure, scores eviction candidates using a
// weighted AI heuristic, executes cgroup/docker-update-based swaps, and
// publishes pressure signals + swap events to GhostBrain Core via NATS.
//
// NATS subjects:
//   publish:   hypervisor.memory.pressure        — live pressure readings
//              hypervisor.memory.swap.executed    — outcome after swap
//   subscribe: hypervisor.memory.swap.directive   — GhostBrain swap orders

import { readFile }   from 'node:fs/promises';
import { execFile }   from 'node:child_process';
import { promisify }  from 'node:util';
import { randomUUID } from 'node:crypto';
import { CFG }        from './config.js';
import { logger }     from './logger.js';
import { metrics }    from './metrics.js';
import type {
  MemoryPressureSignal,
  SwapDirective,
  SwapOutcome,
  WorkloadMemoryProfile,
} from './types.js';

const execFileAsync = promisify(execFile);

// ─── Constants ────────────────────────────────────────────────────────────────

/** Pressure threshold (0-1) above which a workload is swap-eligible */
const PRESSURE_THRESHOLD = parseFloat(process.env['MEM_SWAP_PRESSURE_THRESHOLD'] ?? '0.80');

/** Maximum number of workloads swapped per reconcile cycle */
const MAX_SWAPS_PER_CYCLE = parseInt(process.env['MEM_SWAP_MAX_PER_CYCLE'] ?? '3', 10);

/** Minimum memory reclaim target in MiB per swap operation */
const MIN_RECLAIM_MIB = parseInt(process.env['MEM_SWAP_MIN_RECLAIM_MIB'] ?? '128', 10);

// ─── AI Scoring ───────────────────────────────────────────────────────────────

/**
 * Computes an eviction priority score [0, 1] for a workload.
 * Higher score → first candidate for swapping.
 *
 * Factors:
 *  - Memory pressure (weighted 0.45)
 *  - Last-activity age: idle workloads swap first (weighted 0.25)
 *  - Restart count: unstable workloads are protected (−weighted 0.15)
 *  - Layer priority: L3 swaps before L2, L2 before L1 (weighted 0.15)
 */
export function scoreWorkload(p: WorkloadMemoryProfile): number {
  const pressureScore  = p.pressureRatio * 0.45;

  const ageSeconds     = (Date.now() - p.lastActivityMs) / 1_000;
  const ageScore       = Math.min(ageSeconds / 3_600, 1) * 0.25; // cap at 1 h

  const instabilityPenalty = Math.min(p.restartCount / 10, 1) * 0.15;

  const layerScore =
    p.layer === 'L3' ? 0.15 :
    p.layer === 'L2' ? 0.10 :
    0.02; // L1 least likely to be swapped

  return pressureScore + ageScore - instabilityPenalty + layerScore;
}

// ─── /proc/meminfo reader ─────────────────────────────────────────────────────

interface HostMemInfo {
  totalKiB:    number;
  availableKiB: number;
  swapTotalKiB: number;
  swapFreeKiB:  number;
}

async function readHostMemInfo(): Promise<HostMemInfo> {
  try {
    const raw  = await readFile('/proc/meminfo', 'utf8');
    const get  = (key: string): number => {
      const m = new RegExp(`^${key}:\\s+(\\d+)`,'m').exec(raw);
      return m ? parseInt(m[1]!, 10) : 0;
    };
    return {
      totalKiB:     get('MemTotal'),
      availableKiB: get('MemAvailable'),
      swapTotalKiB: get('SwapTotal'),
      swapFreeKiB:  get('SwapFree'),
    };
  } catch {
    // Not on Linux or no access — return synthetic data for dev environments
    return { totalKiB: 16_384_000, availableKiB: 8_192_000, swapTotalKiB: 4_096_000, swapFreeKiB: 2_048_000 };
  }
}

// ─── Docker stats sampler ─────────────────────────────────────────────────────

interface DockerStatRaw {
  ID:       string;
  Name:     string;
  MemUsage: string;  // e.g. "512MiB / 2GiB"
  MemPerc:  string;  // e.g. "25.00%"
}

async function sampleDockerWorkloads(): Promise<WorkloadMemoryProfile[]> {
  try {
    const { stdout } = await execFileAsync('docker', [
      'stats', '--no-stream', '--no-trunc',
      '--format', '{{json .}}',
    ], { timeout: 10_000 });

    return stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => {
        try {
          const r = JSON.parse(line) as DockerStatRaw;
          const pct = parseFloat(r.MemPerc.replace('%', '')) / 100;
          const usage = _parseMib(r.MemUsage.split('/')[0]?.trim() ?? '0');
          const profile: WorkloadMemoryProfile = {
            kind:           'container',
            id:             r.ID,
            name:           r.Name,
            layer:          _inferLayer(r.Name),
            memUsageMiB:    usage,
            memLimitMiB:    _parseMib(r.MemUsage.split('/')[1]?.trim() ?? '0'),
            pressureRatio:  pct,
            lastActivityMs: Date.now(),
            restartCount:   0,
            swappable:      pct > PRESSURE_THRESHOLD,
          };
          return profile;
        } catch {
          return null;
        }
      })
      .filter((x): x is WorkloadMemoryProfile => x !== null);
  } catch (err) {
    logger.debug('docker stats unavailable — skipping container memory sample', { err: String(err) });
    return [];
  }
}

// ─── Pressure sampling ────────────────────────────────────────────────────────

/**
 * Collects memory pressure signals across all workloads on this host.
 * Returns one signal per workload plus one aggregate host signal.
 */
export async function sampleMemoryPressure(): Promise<MemoryPressureSignal[]> {
  const [hostMem, containerProfiles] = await Promise.all([
    readHostMemInfo(),
    CFG.dockerEnabled ? sampleDockerWorkloads() : Promise.resolve([] as WorkloadMemoryProfile[]),
  ]);

  const hostPressure    = 1 - hostMem.availableKiB / hostMem.totalKiB;
  const swapUsageRatio  = hostMem.swapTotalKiB > 0
    ? (hostMem.swapTotalKiB - hostMem.swapFreeKiB) / hostMem.swapTotalKiB
    : 0;

  const signals: MemoryPressureSignal[] = [];

  // Host-level aggregated signal
  signals.push({
    signalId:      randomUUID(),
    source:        'host',
    workloadId:    'host',
    workloadName:  'host',
    layer:         'L1',
    memUsageMiB:   Math.round((hostMem.totalKiB - hostMem.availableKiB) / 1_024),
    memTotalMiB:   Math.round(hostMem.totalKiB / 1_024),
    pressureRatio: hostPressure,
    swapUsageRatio,
    anomaly:       hostPressure > PRESSURE_THRESHOLD,
    observedAt:    new Date().toISOString(),
    profiles:      containerProfiles,
  });

  // Per-container signals
  for (const p of containerProfiles) {
    signals.push({
      signalId:      randomUUID(),
      source:        'container',
      workloadId:    p.id,
      workloadName:  p.name,
      layer:         p.layer,
      memUsageMiB:   Math.round(p.memUsageMiB),
      memTotalMiB:   Math.round(p.memLimitMiB),
      pressureRatio: p.pressureRatio,
      swapUsageRatio: 0,
      anomaly:       p.pressureRatio > PRESSURE_THRESHOLD,
      observedAt:    new Date().toISOString(),
      profiles:      [],
    });
  }

  metrics.memoryPressureSamples = (metrics.memoryPressureSamples ?? 0) + signals.length;
  return signals;
}

// ─── Swap execution ───────────────────────────────────────────────────────────

/**
 * Selects swap candidates using AI scoring and executes memory reclaim.
 * Returns the list of swap outcomes for audit.
 */
export async function runMemorySwapCycle(
  profiles: WorkloadMemoryProfile[],
): Promise<SwapOutcome[]> {
  const candidates = profiles
    .filter(p => p.swappable)
    .map(p => ({ profile: p, score: scoreWorkload(p) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SWAPS_PER_CYCLE);

  if (candidates.length === 0) {
    logger.debug('MemorySwap: no swap candidates in this cycle');
    return [];
  }

  logger.info('MemorySwap: swap candidates selected', {
    count: candidates.length,
    targets: candidates.map(c => c.profile.name),
  });

  const outcomes: SwapOutcome[] = [];

  for (const { profile, score } of candidates) {
    const outcome = await _executeSwap(profile, score);
    outcomes.push(outcome);
    metrics.memorySwapsExecuted = (metrics.memorySwapsExecuted ?? 0) + 1;
    if (!outcome.success) {
      metrics.memorySwapFailures = (metrics.memorySwapFailures ?? 0) + 1;
    }
  }

  return outcomes;
}

/** Execute a single memory swap action for the given workload profile. */
async function _executeSwap(p: WorkloadMemoryProfile, score: number): Promise<SwapOutcome> {
  const startMs = Date.now();

  if (p.kind === 'container') {
    return _swapContainer(p, score, startMs);
  }
  // VM swap via libvirt balloon (future: virsh setmem)
  return _swapVm(p, score, startMs);
}

async function _swapContainer(
  p: WorkloadMemoryProfile,
  score: number,
  startMs: number,
): Promise<SwapOutcome> {
  // Calculate new memory limit: shrink by 20% to reclaim pressure
  const newLimitMiB = Math.max(
    Math.round(p.memLimitMiB * 0.80),
    MIN_RECLAIM_MIB,
  );
  const reclaimedMiB = p.memLimitMiB - newLimitMiB;

  if (reclaimedMiB < MIN_RECLAIM_MIB) {
    logger.debug('MemorySwap: reclaim below threshold, skipping', { name: p.name, reclaimedMiB });
    return {
      swapId:       randomUUID(),
      workloadId:   p.id,
      workloadName: p.name,
      layer:        p.layer,
      action:       'skip',
      score,
      reclaimedMiB: 0,
      success:      false,
      reason:       `reclaim ${reclaimedMiB}MiB < threshold ${MIN_RECLAIM_MIB}MiB`,
      durationMs:   Date.now() - startMs,
      executedAt:   new Date().toISOString(),
    };
  }

  try {
    await execFileAsync('docker', [
      'update',
      `--memory=${newLimitMiB}m`,
      `--memory-swap=${newLimitMiB * 2}m`,
      p.id,
    ], { timeout: 10_000 });

    logger.info('MemorySwap: container memory reduced', {
      name: p.name,
      from: `${p.memLimitMiB}MiB`,
      to: `${newLimitMiB}MiB`,
      reclaimedMiB,
      score: score.toFixed(3),
    });

    return {
      swapId:       randomUUID(),
      workloadId:   p.id,
      workloadName: p.name,
      layer:        p.layer,
      action:       'memory_limit_reduce',
      score,
      reclaimedMiB,
      success:      true,
      reason:       `Reduced memory limit by ${reclaimedMiB}MiB (score ${score.toFixed(3)})`,
      durationMs:   Date.now() - startMs,
      executedAt:   new Date().toISOString(),
    };
  } catch (err) {
    logger.warn('MemorySwap: docker update failed', { name: p.name, err: String(err) });
    return {
      swapId:       randomUUID(),
      workloadId:   p.id,
      workloadName: p.name,
      layer:        p.layer,
      action:       'memory_limit_reduce',
      score,
      reclaimedMiB: 0,
      success:      false,
      reason:       String(err),
      durationMs:   Date.now() - startMs,
      executedAt:   new Date().toISOString(),
    };
  }
}

async function _swapVm(
  p: WorkloadMemoryProfile,
  score: number,
  startMs: number,
): Promise<SwapOutcome> {
  const newMiB = Math.max(Math.round(p.memLimitMiB * 0.80), MIN_RECLAIM_MIB);
  const reclaimedMiB = p.memLimitMiB - newMiB;

  try {
    // virsh setmem <domain> <kilobytes> --live
    await execFileAsync('virsh', ['setmem', p.name, String(newMiB * 1_024), '--live'], { timeout: 15_000 });

    logger.info('MemorySwap: VM balloon reduced', {
      name: p.name, from: `${p.memLimitMiB}MiB`, to: `${newMiB}MiB`, reclaimedMiB,
    });

    return {
      swapId: randomUUID(), workloadId: p.id, workloadName: p.name,
      layer: p.layer, action: 'vm_balloon_reduce', score, reclaimedMiB,
      success: true, reason: `VM balloon reduced by ${reclaimedMiB}MiB`,
      durationMs: Date.now() - startMs, executedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      swapId: randomUUID(), workloadId: p.id, workloadName: p.name,
      layer: p.layer, action: 'vm_balloon_reduce', score, reclaimedMiB: 0,
      success: false, reason: String(err),
      durationMs: Date.now() - startMs, executedAt: new Date().toISOString(),
    };
  }
}

// ─── Directive handler ────────────────────────────────────────────────────────

/**
 * Processes a swap directive received from GhostBrain Core.
 * Validates policy constraints before acting.
 */
export async function handleSwapDirective(directive: SwapDirective): Promise<SwapOutcome> {
  logger.info('MemorySwap: processing GhostBrain directive', {
    directiveId: directive.directiveId,
    workloadId:  directive.workloadId,
    action:      directive.action,
  });

  const startMs = Date.now();

  // Routing law guard: L3 → L2 path only, never L3 → L1 direct
  if (directive.sourceLayer === 'L3' && directive.targetLayer === 'L1') {
    const reason = 'Routing law violation: L3→L1 direct swap forbidden';
    logger.error('MemorySwap: ' + reason, { directiveId: directive.directiveId });
    return {
      swapId: randomUUID(), workloadId: directive.workloadId, workloadName: directive.workloadName,
      layer: directive.targetLayer, action: directive.action, score: 0, reclaimedMiB: 0,
      success: false, reason,
      durationMs: Date.now() - startMs, executedAt: new Date().toISOString(),
    };
  }

  const syntheticProfile: WorkloadMemoryProfile = {
    kind:           directive.kind,
    id:             directive.workloadId,
    name:           directive.workloadName,
    layer:          directive.targetLayer,
    memUsageMiB:    directive.currentMemMiB,
    memLimitMiB:    directive.currentMemMiB,
    pressureRatio:  directive.pressureRatio,
    lastActivityMs: directive.lastActivityMs,
    restartCount:   0,
    swappable:      true,
  };

  return _executeSwap(syntheticProfile, directive.aiScore);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function _parseMib(raw: string): number {
  if (/GiB$/i.test(raw))  return parseFloat(raw) * 1_024;
  if (/MiB$/i.test(raw))  return parseFloat(raw);
  if (/KiB$/i.test(raw))  return parseFloat(raw) / 1_024;
  if (/GB$/i.test(raw))   return parseFloat(raw) * 953.67;
  if (/MB$/i.test(raw))   return parseFloat(raw);
  return parseFloat(raw) || 0;
}

function _inferLayer(name: string): 'L1' | 'L2' | 'L3' {
  if (/[-_]l3/i.test(name)) return 'L3';
  if (/[-_]l2/i.test(name)) return 'L2';
  return 'L1';
}
