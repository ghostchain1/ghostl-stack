/**
 * GhostBrain Core — Docker Monitor
 *
 * Continuous monitoring loop for Docker containers built on top of
 * docker_controller.ts. Provides:
 *
 *   • Per-container CPU / memory / restart time-series
 *   • High-severity alerts for containers exceeding thresholds
 *   • Automatic crash detection (restart count delta > 0)
 *   • Integration with memory_engine and failure_predictor
 *   • Live fleet map (getContainerFleet())
 *
 * This module is observation-only — remediation goes through auto_repair_engine.
 */

import { collectDockerSnapshots }  from "./infra/docker_controller.js";
import { getInfraHistory }          from "./memory/infrastructure_memory.js";
import { store_event }              from "./memory_engine.js";
import { log }                   from "./observability/event_logger.js";

// ── Config ────────────────────────────────────────────────────────────────────

const SAMPLE_INTERVAL_MS   = Number(process.env.DOCKER_MONITOR_INTERVAL_MS ?? "20000"); // 20 s
const CPU_WARN_PCT         = Number(process.env.DOCKER_MONITOR_CPU_WARN    ?? "80");
const MEM_WARN_PCT         = Number(process.env.DOCKER_MONITOR_MEM_WARN    ?? "90");
const RESTART_ALERT_DELTA  = Number(process.env.DOCKER_RESTART_DELTA       ?? "1");     // restarts per window

// ── State ─────────────────────────────────────────────────────────────────────

export interface ContainerState {
  id:           string;
  name:         string;
  image:        string;
  cpuPct:       number;
  memPct:       number;
  memBytes:     number;
  netRxBytes:   number;
  netTxBytes:   number;
  blkReadBytes: number;
  blkWriteBytes: number;
  restarts:     number;
  healthy:      boolean;
  sampledAt:    number;
}

const _fleet   = new Map<string, ContainerState>();
const _prevRestarts = new Map<string, number>();
let _sampleCount    = 0;
let _interval: ReturnType<typeof setInterval> | null = null;

// ── Core sampling ─────────────────────────────────────────────────────────────

async function sampleContainers(): Promise<void> {
  try {
    const result = await collectDockerSnapshots(); // pushes to InfraMemory internally
    _sampleCount++;

    // Read latest container snapshots from memory (last 60s)
    const snaps = getInfraHistory(undefined, "container", 60_000);
    const latest = new Map<string, typeof snaps[0]>();
    for (const s of snaps) {
      const ex = latest.get(s.resourceId);
      if (!ex || s.ts > ex.ts) latest.set(s.resourceId, s);
    }

    for (const [, snap] of latest) {
      const prev         = _prevRestarts.get(snap.resourceId) ?? snap.restarts;
      const restartDelta = Math.max(0, snap.restarts - prev);
      _prevRestarts.set(snap.resourceId, snap.restarts);

      const state: ContainerState = {
        id:            String(snap.meta.dockerId ?? snap.resourceId),
        name:          snap.resourceId,
        image:         String(snap.meta.image ?? ""),
        cpuPct:        snap.cpuPct,
        memPct:        snap.memPct,
        memBytes:      0,
        netRxBytes:    0,
        netTxBytes:    0,
        blkReadBytes:  0,
        blkWriteBytes: 0,
        restarts:      snap.restarts,
        healthy:       snap.healthy,
        sampledAt:     snap.ts,
      };
      _fleet.set(snap.resourceId, state);

      if (restartDelta >= RESTART_ALERT_DELTA) {
        store_event({
          resourceId: snap.resourceId,
          layer:      "container",
          category:   "crash",
          label:      "container_restart",
          severity:   restartDelta >= 3 ? "critical" : "warning",
          payload:    { restartDelta, totalRestarts: snap.restarts },
        });
      }

      if (snap.cpuPct >= CPU_WARN_PCT) {
        store_event({
          resourceId: snap.resourceId,
          layer:      "container",
          category:   "alert",
          label:      snap.cpuPct >= 95 ? "cpu_critical" : "cpu_high",
          severity:   snap.cpuPct >= 95 ? "critical" : "warning",
          payload:    { cpuPct: snap.cpuPct },
        });
      }

      if (snap.memPct >= MEM_WARN_PCT) {
        store_event({
          resourceId: snap.resourceId,
          layer:      "container",
          category:   "alert",
          label:      snap.memPct >= 97 ? "oom_imminent" : "mem_high",
          severity:   snap.memPct >= 97 ? "critical" : "warning",
          payload:    { memPct: snap.memPct },
        });
      }

      if (!snap.healthy) {
        store_event({
          resourceId: snap.resourceId,
          layer:      "container",
          category:   "health",
          label:      "container_unhealthy",
          severity:   "warning",
          payload:    { state: String(snap.meta.state ?? "unknown") },
        });
      }
    }

    log.debug("docker_monitor: sampled", `processed=${result.processed} sampleCount=${_sampleCount}`);
  } catch (err) {
    log.warn("docker_monitor: sample_error", String(err));
  }
}

// ── Loop control ──────────────────────────────────────────────────────────────

export function startDockerMonitor(): void {
  if (_interval) return;
  void sampleContainers();
  _interval = setInterval(() => void sampleContainers(), SAMPLE_INTERVAL_MS);
  log.info("docker_monitor: started", `intervalMs=${SAMPLE_INTERVAL_MS}`);
}

export function stopDockerMonitor(): void {
  if (_interval) { clearInterval(_interval); _interval = null; }
}

// ── Query helpers ─────────────────────────────────────────────────────────────

export function getContainerFleet(): ContainerState[] {
  return [..._fleet.values()];
}

export function getContainer(nameOrId: string): ContainerState | undefined {
  return _fleet.get(nameOrId)
    ?? [..._fleet.values()].find(c => c.name === nameOrId);
}

export function getUnhealthyContainers(): ContainerState[] {
  return [..._fleet.values()].filter(
    c => !c.healthy || c.cpuPct >= CPU_WARN_PCT || c.memPct >= MEM_WARN_PCT
  );
}

export function getDockerMonitorStats() {
  const fleet = [..._fleet.values()];
  return {
    totalContainers:   fleet.length,
    healthyContainers: fleet.filter(c => c.healthy).length,
    sampleCount:       _sampleCount,
    thresholds:        { cpuWarn: CPU_WARN_PCT, memWarn: MEM_WARN_PCT },
  };
}
