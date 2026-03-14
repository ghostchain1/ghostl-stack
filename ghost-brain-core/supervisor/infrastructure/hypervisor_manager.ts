/**
 * Hypervisor Manager
 *
 * Monitors host-level CPU, memory, and load average. Reports HypervisorMetrics
 * each tick. Does not execute any system commands — read-only via Node.js `os`.
 */

import os from "os";
import type { IController } from "../brain/supervisor_core.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HypervisorMetrics {
  load1m:        number;
  load5m:        number;
  load15m:       number;
  memTotalBytes: number;
  memFreeBytes:  number;
  memUsedPct:    number;
  cpuCount:      number;
  uptimeSeconds: number;
  sampledAt:     number;
}

export type HypervisorAlert = "high_load" | "high_memory" | "critical_memory";

// ---------------------------------------------------------------------------
// Thresholds (overridable via env)
// ---------------------------------------------------------------------------

const LOAD_WARN_RATIO     = Number(process.env["HYPERVISOR_LOAD_WARN"]     ?? "0.8"); // fraction of cpu count
const MEM_WARN_PCT        = Number(process.env["HYPERVISOR_MEM_WARN_PCT"]  ?? "85");
const MEM_CRITICAL_PCT    = Number(process.env["HYPERVISOR_MEM_CRIT_PCT"]  ?? "95");

// ---------------------------------------------------------------------------
// HypervisorManager
// ---------------------------------------------------------------------------

export class HypervisorManager implements IController {
  readonly name = "HypervisorManager";

  private latestMetrics: HypervisorMetrics | null = null;
  private onAlert?: (alert: HypervisorAlert, metrics: HypervisorMetrics) => void;

  constructor(onAlert?: (alert: HypervisorAlert, metrics: HypervisorMetrics) => void) {
    this.onAlert = onAlert;
  }

  async check(): Promise<void> {
    const metrics = this.collect();
    this.latestMetrics = metrics;

    const cpuCount  = metrics.cpuCount;
    const loadRatio = metrics.load1m / Math.max(cpuCount, 1);

    if (loadRatio >= LOAD_WARN_RATIO) {
      console.warn(
        `[HypervisorManager] High load: ${metrics.load1m.toFixed(2)} ` +
        `(${(loadRatio * 100).toFixed(0)}% of ${cpuCount} CPUs)`
      );
      this.onAlert?.("high_load", metrics);
    }

    if (metrics.memUsedPct >= MEM_CRITICAL_PCT) {
      console.error(`[HypervisorManager] CRITICAL memory: ${metrics.memUsedPct.toFixed(1)}%`);
      this.onAlert?.("critical_memory", metrics);
    } else if (metrics.memUsedPct >= MEM_WARN_PCT) {
      console.warn(`[HypervisorManager] High memory: ${metrics.memUsedPct.toFixed(1)}%`);
      this.onAlert?.("high_memory", metrics);
    }
  }

  getLatestMetrics(): HypervisorMetrics | null {
    return this.latestMetrics;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private collect(): HypervisorMetrics {
    const [load1m = 0, load5m = 0, load15m = 0] = os.loadavg();
    const memTotal = os.totalmem();
    const memFree  = os.freemem();
    const memUsed  = memTotal - memFree;

    return {
      load1m,
      load5m,
      load15m,
      memTotalBytes: memTotal,
      memFreeBytes:  memFree,
      memUsedPct:    memTotal > 0 ? (memUsed / memTotal) * 100 : 0,
      cpuCount:      os.cpus().length,
      uptimeSeconds: os.uptime(),
      sampledAt:     Date.now(),
    };
  }
}
