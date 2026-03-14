// ── Anomaly Detector ──────────────────────────────────────────────────────────
// Detects abnormal behavior using z-score against rolling baselines plus
// hard thresholds. Maintains a capped history ring-buffer.
//
// Detects: DDoS-pattern network spikes, CPU anomalies, multi-node failures,
// latency spikes, and disk critical events.

import { SystemMetrics } from "../monitoring/metricsCollector";

export type AnomalySeverity = "low" | "medium" | "high" | "critical";

export interface Anomaly {
  id:          string;
  nodeId:      string;
  type:        string;
  description: string;
  severity:    AnomalySeverity;
  value:       number;
  threshold:   number;
  timestamp:   number;
}

export interface AnomalyReport {
  anomaly:   boolean;
  anomalies: Anomaly[];
  reason:    string;
  timestamp: number;
}

// ── Rolling z-score baseline ───────────────────────────────────────────────────
interface Stat { sum: number; sum2: number; count: number }
const baseline: Record<"cpu" | "memory" | "network", Stat> = {
  cpu:     { sum: 0, sum2: 0, count: 0 },
  memory:  { sum: 0, sum2: 0, count: 0 },
  network: { sum: 0, sum2: 0, count: 0 },
};

function updateBaseline(cpu: number, memory: number, network: number): void {
  baseline.cpu.sum     += cpu;     baseline.cpu.sum2     += cpu * cpu;     baseline.cpu.count++;
  baseline.memory.sum  += memory;  baseline.memory.sum2  += memory * memory; baseline.memory.count++;
  baseline.network.sum += network; baseline.network.sum2 += network * network; baseline.network.count++;
}

function zScore(stat: Stat, value: number): number {
  if (stat.count < 5) return 0; // need at least 5 data points
  const mean     = stat.sum / stat.count;
  const variance = Math.max(0, (stat.sum2 / stat.count) - mean * mean);
  const std      = Math.sqrt(variance);
  return std > 0 ? Math.abs(value - mean) / std : 0;
}

// ── Anomaly history ring-buffer ────────────────────────────────────────────────
let anomalyHistory: Anomaly[] = [];
let idCounter = 0;

function makeId(): string {
  return `ANOM-${String(++idCounter).padStart(5, "0")}`;
}

// ── Main detection function ────────────────────────────────────────────────────
export async function detectAnomaly(metrics: SystemMetrics): Promise<AnomalyReport> {
  updateBaseline(metrics.avgCpu, metrics.avgMemory, metrics.avgNetwork);

  const anomalies: Anomaly[] = [];

  // Network spike (threshold + z-score)
  const netZ = zScore(baseline.network, metrics.avgNetwork);
  if (metrics.avgNetwork > 800 || netZ > 3) {
    anomalies.push({
      id:          makeId(),
      nodeId:      "system",
      type:        "network_spike",
      description: `Network traffic anomaly: ${metrics.avgNetwork.toFixed(0)} Mbps avg (z=${netZ.toFixed(1)}) — possible DDoS`,
      severity:    metrics.avgNetwork > 1500 ? "critical" : "high",
      value:       metrics.avgNetwork,
      threshold:   800,
      timestamp:   Date.now(),
    });
  }

  // CPU anomaly
  const cpuZ = zScore(baseline.cpu, metrics.avgCpu);
  if (metrics.avgCpu > 85 || cpuZ > 3) {
    anomalies.push({
      id:          makeId(),
      nodeId:      "system",
      type:        "cpu_spike",
      description: `CPU usage anomaly: ${metrics.avgCpu.toFixed(0)}% avg (z=${cpuZ.toFixed(1)})`,
      severity:    metrics.avgCpu > 95 ? "critical" : "high",
      value:       metrics.avgCpu,
      threshold:   85,
      timestamp:   Date.now(),
    });
  }

  // Multi-node failure cascade
  if (metrics.offlineNodes >= 2) {
    anomalies.push({
      id:          makeId(),
      nodeId:      "system",
      type:        "multi_node_failure",
      description: `${metrics.offlineNodes} nodes offline — possible cascade failure or DDoS`,
      severity:    metrics.offlineNodes >= 3 ? "critical" : "high",
      value:       metrics.offlineNodes,
      threshold:   2,
      timestamp:   Date.now(),
    });
  }

  // Per-node checks: latency spike and disk critical
  for (const node of metrics.nodes) {
    if (node.latency > 1000) {
      anomalies.push({
        id:          makeId(),
        nodeId:      node.nodeId,
        type:        "latency_spike",
        description: `High latency on ${node.label}: ${node.latency.toFixed(0)} ms`,
        severity:    node.latency > 3000 ? "critical" : "medium",
        value:       node.latency,
        threshold:   1000,
        timestamp:   Date.now(),
      });
    }
    if (node.disk > 95) {
      anomalies.push({
        id:          makeId(),
        nodeId:      node.nodeId,
        type:        "disk_full",
        description: `Disk critically full on ${node.label}: ${node.disk.toFixed(0)}%`,
        severity:    "critical",
        value:       node.disk,
        threshold:   95,
        timestamp:   Date.now(),
      });
    }
  }

  // Append to history, cap at 500 entries
  anomalyHistory.push(...anomalies);
  if (anomalyHistory.length > 500) anomalyHistory = anomalyHistory.slice(-500);

  return {
    anomaly:   anomalies.length > 0,
    anomalies,
    reason:    anomalies.map(a => a.type).join(", ") || "none",
    timestamp: Date.now(),
  };
}

export function getAnomalyHistory(): Anomaly[] { return anomalyHistory; }
