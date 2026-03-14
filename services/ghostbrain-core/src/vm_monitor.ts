/**
 * GhostBrain Core — VM Monitor
 *
 * Continuous monitoring loop for virtual machines reported by the
 * hypervisor controller.  Wraps `vm_controller.ts` into a time-series
 * feed that:
 *
 *   • Samples every VM in the fleet at a configurable interval
 *   • Pushes snapshots to infrastructure_memory and memory_engine
 *   • Emits high-severity events for VMs exceeding CPU/mem thresholds
 *   • Triggers failure_predictor scoring on every sample
 *   • Provides a stable map of the current fleet state (getVMFleet())
 *
 * All remediation proposals must go through auto_repair_engine — this
 * module is observation-only.
 */

import { collectVmSnapshots }     from "./infra/vm_controller.js";
import { getInfraHistory }         from "./memory/infrastructure_memory.js";
import { store_event }             from "./memory_engine.js";

import { log }                   from "./observability/event_logger.js";

const SAMPLE_INTERVAL_MS = Number(process.env.VM_MONITOR_INTERVAL_MS ?? "30000");  // 30 s
const CPU_WARN_PCT       = Number(process.env.VM_MONITOR_CPU_WARN    ?? "80");
const MEM_WARN_PCT       = Number(process.env.VM_MONITOR_MEM_WARN    ?? "85");
const CPU_CRIT_PCT       = Number(process.env.VM_MONITOR_CPU_CRIT    ?? "92");
const MEM_CRIT_PCT       = Number(process.env.VM_MONITOR_MEM_CRIT    ?? "94");

// ── State ─────────────────────────────────────────────────────────────────────

export interface VMState {
  vmId:       string;
  vmName:     string;
  host?:      string;
  cpuPct:     number;
  memPct:     number;
  diskIoPct:  number;
  netMbps:    number;
  state:      string;            // running | stopped | error | migrating
  healthy:    boolean;
  sampledAt:  number;
}

const _fleet = new Map<string, VMState>();
let _sampleCount = 0;
let _interval: ReturnType<typeof setInterval> | null = null;

// ── Core sampling ─────────────────────────────────────────────────────────────

async function sampleFleet(): Promise<void> {
  try {
    const result = await collectVmSnapshots(); // pushes to InfraMemory internally
    _sampleCount++;

    // Read latest VM snapshots from memory (last 60s)
    const snaps = getInfraHistory(undefined, "vm", 60_000);
    const latest = new Map<string, typeof snaps[0]>();
    for (const s of snaps) {
      const ex = latest.get(s.resourceId);
      if (!ex || s.ts > ex.ts) latest.set(s.resourceId, s);
    }

    for (const [, snap] of latest) {
      const state: VMState = {
        vmId:      snap.resourceId,
        vmName:    String(snap.meta.name ?? snap.resourceId),
        host:      snap.meta.host as string | undefined,
        cpuPct:    snap.cpuPct,
        memPct:    snap.memPct,
        diskIoPct: snap.diskIoPct,
        netMbps:   snap.netMbps,
        state:     String(snap.meta.state ?? "unknown"),
        healthy:   snap.healthy,
        sampledAt: snap.ts,
      };
      _fleet.set(snap.resourceId, state);

      if (snap.cpuPct >= CPU_CRIT_PCT || snap.memPct >= MEM_CRIT_PCT) {
        store_event({
          resourceId: snap.resourceId,
          layer:      "vm",
          category:   "alert",
          label:      snap.cpuPct >= CPU_CRIT_PCT ? "cpu_critical" : "mem_critical",
          severity:   "critical",
          payload:    { cpuPct: snap.cpuPct, memPct: snap.memPct, host: snap.meta.host },
        });
      } else if (snap.cpuPct >= CPU_WARN_PCT || snap.memPct >= MEM_WARN_PCT) {
        store_event({
          resourceId: snap.resourceId,
          layer:      "vm",
          category:   "alert",
          label:      "resource_pressure",
          severity:   "warning",
          payload:    { cpuPct: snap.cpuPct, memPct: snap.memPct },
        });
      }

      if (!snap.healthy) {
        store_event({
          resourceId: snap.resourceId,
          layer:      "vm",
          category:   "health",
          label:      "vm_unhealthy",
          severity:   "warning",
          payload:    { state: String(snap.meta.state ?? "unknown") },
        });
      }
    }

    log.debug("vm_monitor: fleet_sampled", `processed=${result.processed} sampleCount=${_sampleCount}`);
  } catch (err) {
    log.warn("vm_monitor: sample_error", String(err));
  }
}

// ── Loop control ──────────────────────────────────────────────────────────────

export function startVMMonitor(): void {
  if (_interval) return;
  void sampleFleet();
  _interval = setInterval(() => void sampleFleet(), SAMPLE_INTERVAL_MS);
  log.info("vm_monitor: started", `intervalMs=${SAMPLE_INTERVAL_MS}`);
}

export function stopVMMonitor(): void {
  if (_interval) { clearInterval(_interval); _interval = null; }
}

// ── Query helpers ─────────────────────────────────────────────────────────────

export function getVMFleet(): VMState[] {
  return [..._fleet.values()];
}

export function getVM(vmId: string): VMState | undefined {
  return _fleet.get(vmId);
}

export function getUnhealthyVMs(): VMState[] {
  return [..._fleet.values()].filter(v => !v.healthy || v.cpuPct >= CPU_WARN_PCT || v.memPct >= MEM_WARN_PCT);
}

export function getVMMonitorStats() {
  const fleet = [..._fleet.values()];
  return {
    totalVMs:    fleet.length,
    healthyVMs:  fleet.filter(v => v.healthy).length,
    sampleCount: _sampleCount,
    thresholds:  { cpuWarn: CPU_WARN_PCT, memWarn: MEM_WARN_PCT, cpuCrit: CPU_CRIT_PCT, memCrit: MEM_CRIT_PCT },
  };
}
