/**
 * systemHealth.ts — System resource monitor
 *
 * Reads CPU, memory, disk and network stats using the `systeminformation`
 * package (pure JS, no shell injection risk).  Falls back to os module when
 * systeminformation is unavailable so unit tests can run anywhere.
 */

import * as os from "os";
import logger from "../utils/logger";

export type HealthStatus = "healthy" | "degraded" | "critical";

export interface CpuInfo {
  cores: number;
  model: string;
  loadAvg1m: number;
  loadAvg5m: number;
  usagePercent: number;
}

export interface MemInfo {
  totalGB: number;
  usedGB: number;
  freeGB: number;
  usedPercent: number;
}

export interface DiskInfo {
  mount: string;
  totalGB: number;
  usedGB: number;
  usedPercent: number;
}

export interface NetInfo {
  iface: string;
  rxMBs: number;
  txMBs: number;
}

export interface SystemSnapshot {
  timestamp: string;
  cpu: CpuInfo;
  memory: MemInfo;
  disks: DiskInfo[];
  network: NetInfo[];
  uptime: number;
  status: HealthStatus;
  issues: string[];
}

// ── Thresholds ────────────────────────────────────────────────────────────────

const CPU_WARN    = Number(process.env.AIE_CPU_WARN    ?? 70);
const CPU_CRIT    = Number(process.env.AIE_CPU_CRIT    ?? 85);
const MEM_WARN    = Number(process.env.AIE_MEM_WARN    ?? 75);
const MEM_CRIT    = Number(process.env.AIE_MEM_CRIT    ?? 90);
const DISK_WARN   = Number(process.env.AIE_DISK_WARN   ?? 80);
const DISK_CRIT   = Number(process.env.AIE_DISK_CRIT   ?? 92);

// ── Internal history ──────────────────────────────────────────────────────────

const history: SystemSnapshot[] = [];
const MAX_HISTORY = 120; // keep last 60 min @ 30 s intervals

// ── Metric helpers ────────────────────────────────────────────────────────────

async function getCpu(): Promise<CpuInfo> {
  const cpus   = os.cpus();
  const load   = os.loadavg();
  const cores  = cpus.length;
  const model  = cpus[0]?.model ?? "Unknown";
  // Derive a rough usage % from 1-min load average
  const usagePercent = Math.min(100, Math.round((load[0] / cores) * 100 * 10) / 10);
  return { cores, model, loadAvg1m: load[0], loadAvg5m: load[1], usagePercent };
}

function getMem(): MemInfo {
  const total      = os.totalmem();
  const free       = os.freemem();
  const used       = total - free;
  const toGB       = (b: number) => Math.round((b / 1_073_741_824) * 100) / 100;
  return {
    totalGB:    toGB(total),
    usedGB:     toGB(used),
    freeGB:     toGB(free),
    usedPercent: Math.round((used / total) * 1000) / 10,
  };
}

async function getDisks(): Promise<DiskInfo[]> {
  // Try systeminformation; silently fall back to a single synthetic entry
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const si = require("systeminformation") as typeof import("systeminformation");
    const parts = await si.fsSize();
    return parts
      .filter((p) => p.size > 0)
      .map((p) => ({
        mount:       p.mount,
        totalGB:     Math.round((p.size  / 1e9) * 100) / 100,
        usedGB:      Math.round((p.used  / 1e9) * 100) / 100,
        usedPercent: Math.round((p.use ?? 0) * 10) / 10,
      }));
  } catch {
    return [{ mount: "/", totalGB: 0, usedGB: 0, usedPercent: 0 }];
  }
}

async function getNetwork(): Promise<NetInfo[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const si = require("systeminformation") as typeof import("systeminformation");
    const stats = await si.networkStats();
    return stats.map((s) => ({
      iface: s.iface,
      rxMBs: Math.round((s.rx_sec / 1_000_000) * 1000) / 1000,
      txMBs: Math.round((s.tx_sec / 1_000_000) * 1000) / 1000,
    }));
  } catch {
    return [];
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function checkSystemHealth(): Promise<SystemSnapshot> {
  const [cpu, mem, disks, network] = await Promise.all([
    getCpu(),
    getMem(),
    getDisks(),
    getNetwork(),
  ]);

  const issues: string[] = [];

  if (cpu.usagePercent >= CPU_CRIT)       issues.push(`CPU critical: ${cpu.usagePercent}%`);
  else if (cpu.usagePercent >= CPU_WARN)  issues.push(`CPU elevated: ${cpu.usagePercent}%`);

  if (mem.usedPercent >= MEM_CRIT)        issues.push(`Memory critical: ${mem.usedPercent}%`);
  else if (mem.usedPercent >= MEM_WARN)   issues.push(`Memory elevated: ${mem.usedPercent}%`);

  for (const d of disks) {
    if (d.usedPercent >= DISK_CRIT)       issues.push(`Disk critical ${d.mount}: ${d.usedPercent}%`);
    else if (d.usedPercent >= DISK_WARN)  issues.push(`Disk elevated ${d.mount}: ${d.usedPercent}%`);
  }

  const criticalCount = issues.filter((i) =>
    i.toLowerCase().includes("critical"),
  ).length;
  const status: HealthStatus =
    criticalCount > 0 ? "critical" : issues.length > 0 ? "degraded" : "healthy";

  const snap: SystemSnapshot = {
    timestamp: new Date().toISOString(),
    cpu,
    memory: mem,
    disks,
    network,
    uptime: os.uptime(),
    status,
    issues,
  };

  history.unshift(snap);
  if (history.length > MAX_HISTORY) history.pop();

  if (issues.length > 0) logger.warn("[Health] Issues detected", { issues, status });

  return snap;
}

export function getHealthHistory(): SystemSnapshot[] {
  return history.slice(0, 60);
}

export function getLatestHealth(): SystemSnapshot | undefined {
  return history[0];
}
