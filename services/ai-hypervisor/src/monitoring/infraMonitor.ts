/**
 * infraMonitor.ts — GhostStack Hypervisor Control Layer
 * Real-time infrastructure health monitoring: host resources, VMs, containers, nodes.
 */

import { v4 as uuid } from "uuid";
import { getVMs, getVmStats } from "../vm/vmManager";
import { getContainers, getContainerStats } from "../containers/containerManager";
import { getNodes, getNodeStats } from "../nodes/nodeProvisioner";

export type InfraHealth = "healthy" | "degraded" | "critical";

export interface HostMetrics {
  cpuPct:        number;
  cpuCores:      number;
  memUsedGB:     number;
  memTotalGB:    number;
  memPct:        number;
  diskUsedGB:    number;
  diskTotalGB:   number;
  diskPct:       number;
  loadAvg:       [number, number, number];
  networkRxMbps: number;
  networkTxMbps: number;
}

export interface InfraSnapshot {
  snapshotId:  string;
  timestamp:   number;
  host:        HostMetrics;
  vms:         { total: number; running: number; stopped: number; errored: number };
  containers:  { total: number; running: number; stopped: number; restarting: number; errored: number };
  nodes:       { total: number; running: number; offline: number; syncing: number; synced: number };
  healthScore: number;
  health:      InfraHealth;
  alerts:      string[];
}

// ── Host state (simulated, evolves over time) ─────────────────────────────────
let hostMetrics: HostMetrics = {
  cpuPct:        28 + Math.random() * 20,
  cpuCores:      64,
  memUsedGB:     48 + Math.random() * 20,
  memTotalGB:    128,
  memPct:        0,
  diskUsedGB:    1200 + Math.random() * 200,
  diskTotalGB:   4000,
  diskPct:       0,
  loadAvg:       [1.8, 1.6, 1.5],
  networkRxMbps: 80 + Math.random() * 40,
  networkTxMbps: 50 + Math.random() * 30,
};
hostMetrics.memPct  = +((hostMetrics.memUsedGB / hostMetrics.memTotalGB) * 100).toFixed(1);
hostMetrics.diskPct = +((hostMetrics.diskUsedGB / hostMetrics.diskTotalGB) * 100).toFixed(1);

const MAX_SNAPSHOTS = 200;
const history: InfraSnapshot[] = [];

// ── Helpers ───────────────────────────────────────────────────────────────────
function calcHealthScore(host: HostMetrics, alerts: string[]): number {
  let score = 100;
  if (host.cpuPct   > 85) score -= 20; else if (host.cpuPct   > 70) score -= 10;
  if (host.memPct   > 85) score -= 20; else if (host.memPct   > 70) score -= 10;
  if (host.diskPct  > 90) score -= 15; else if (host.diskPct  > 80) score -= 5;
  score -= alerts.length * 5;
  return Math.max(0, Math.min(100, score));
}

function calcHealth(score: number): InfraHealth {
  if (score >= 80) return "healthy";
  if (score >= 50) return "degraded";
  return "critical";
}

function generateAlerts(vmStats: ReturnType<typeof getVmStats>, ctrStats: ReturnType<typeof getContainerStats>, nodeStats: ReturnType<typeof getNodeStats>, host: HostMetrics): string[] {
  const alerts: string[] = [];
  if (vmStats.errored > 0)    alerts.push(`${vmStats.errored} VM(s) in error state`);
  if (vmStats.stopped > 2)    alerts.push(`${vmStats.stopped} VM(s) stopped`);
  if (ctrStats.errored > 0)   alerts.push(`${ctrStats.errored} container(s) in error state`);
  if (ctrStats.restarting > 0)alerts.push(`${ctrStats.restarting} container(s) restarting`);
  if (nodeStats.offline > 0)  alerts.push(`${nodeStats.offline} blockchain node(s) offline`);
  if (host.cpuPct > 85)       alerts.push(`Host CPU critical: ${host.cpuPct.toFixed(1)}%`);
  if (host.memPct > 85)       alerts.push(`Host memory critical: ${host.memPct.toFixed(1)}%`);
  if (host.diskPct > 90)      alerts.push(`Host disk critical: ${host.diskPct.toFixed(1)}%`);
  return alerts;
}

// ── Exports ───────────────────────────────────────────────────────────────────

export function getHostMetrics(): HostMetrics {
  return { ...hostMetrics };
}

export function getLatestSnapshot(): InfraSnapshot | null {
  return history.length > 0 ? history[history.length - 1] : null;
}

export function getHistory(limit = 60): InfraSnapshot[] {
  return history.slice(-limit);
}

export function monitorInfrastructure(): InfraSnapshot {
  const vmStats  = getVmStats();
  const ctrStats = getContainerStats();
  const nodeStats= getNodeStats();
  const alerts   = generateAlerts(vmStats, ctrStats, nodeStats, hostMetrics);
  const score    = calcHealthScore(hostMetrics, alerts);
  const snap: InfraSnapshot = {
    snapshotId:  uuid(),
    timestamp:   Date.now(),
    host:        { ...hostMetrics },
    vms:         { total: vmStats.total, running: vmStats.running, stopped: vmStats.stopped, errored: vmStats.errored },
    containers:  { total: ctrStats.total, running: ctrStats.running, stopped: ctrStats.stopped, restarting: ctrStats.restarting, errored: ctrStats.errored },
    nodes:       { total: nodeStats.total, running: nodeStats.running, offline: nodeStats.offline, syncing: nodeStats.syncing, synced: nodeStats.synced },
    healthScore: score,
    health:      calcHealth(score),
    alerts,
  };
  if (history.length >= MAX_SNAPSHOTS) history.shift();
  history.push(snap);
  return snap;
}

export function tickHostMetrics(): void {
  const h = hostMetrics;
  h.cpuPct        = Math.max(5, Math.min(95, h.cpuPct + (Math.random() - 0.47) * 4));
  h.memUsedGB     = Math.max(20, Math.min(h.memTotalGB - 2, h.memUsedGB + (Math.random() - 0.47) * 1));
  h.memPct        = +((h.memUsedGB / h.memTotalGB) * 100).toFixed(1);
  h.diskUsedGB    = Math.max(800, Math.min(h.diskTotalGB - 100, h.diskUsedGB + (Math.random() - 0.45) * 2));
  h.diskPct       = +((h.diskUsedGB / h.diskTotalGB) * 100).toFixed(1);
  h.networkRxMbps = Math.max(10, Math.min(1000, h.networkRxMbps + (Math.random() - 0.47) * 10));
  h.networkTxMbps = Math.max(5, Math.min(500, h.networkTxMbps + (Math.random() - 0.47) * 8));
  h.loadAvg       = [
    Math.max(0.1, h.loadAvg[0] + (Math.random() - 0.47) * 0.3),
    Math.max(0.1, h.loadAvg[1] + (Math.random() - 0.47) * 0.2),
    Math.max(0.1, h.loadAvg[2] + (Math.random() - 0.47) * 0.1),
  ];
}

// Seed initial snapshot
monitorInfrastructure();
