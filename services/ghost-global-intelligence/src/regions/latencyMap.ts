/**
 * @file src/regions/latencyMap.ts
 * Ghost Global Network Intelligence — Inter-node latency tracker.
 *
 * Maintains a rolling in-memory latency registry updated on each topology
 * poll.  Provides helpers for identifying high-latency nodes that degrade
 * block propagation.  No network calls are made here — latency data is
 * supplied by the topology poller (NodeInfo.latencyMs).
 */

import type { NodeInfo, ChainLayer } from '../types.js';

const LATENCY_WARN_MS  = parseInt(process.env.GNI_LATENCY_WARN  ?? '2000', 10);
const LATENCY_CRIT_MS  = parseInt(process.env.GNI_LATENCY_CRIT  ?? '5000', 10);
const HISTORY_CAPACITY = 60; // 60 samples per node ≈ 1 hour at 1-min polls

interface LatencySample { ts: number; latencyMs: number }
interface LatencyEntry  { endpoint: string; chain: ChainLayer; samples: LatencySample[]; p50: number; p95: number; max: number }

const _latencyMap = new Map<string, LatencyEntry>();

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

function updateEntry(entry: LatencyEntry, latencyMs: number): void {
  entry.samples.push({ ts: Date.now(), latencyMs });
  if (entry.samples.length > HISTORY_CAPACITY) entry.samples.shift();
  const sorted = entry.samples.map(s => s.latencyMs).sort((a, b) => a - b);
  entry.p50 = percentile(sorted, 50);
  entry.p95 = percentile(sorted, 95);
  entry.max = sorted[sorted.length - 1] ?? 0;
}

export function recordLatencies(nodes: NodeInfo[]): void {
  for (const node of nodes) {
    if (!node.healthy) continue;
    const key     = node.endpoint;
    const existing = _latencyMap.get(key);
    if (existing) {
      updateEntry(existing, node.latencyMs);
    } else {
      const entry: LatencyEntry = { endpoint: key, chain: node.chain, samples: [], p50: 0, p95: 0, max: 0 };
      updateEntry(entry, node.latencyMs);
      _latencyMap.set(key, entry);
    }
  }
}

export function getLatencyReport(): LatencyEntry[] {
  return [..._latencyMap.values()];
}

export interface LatencyAlert { endpoint: string; chain: ChainLayer; p95: number; severity: 'warn' | 'critical' }

export function detectHighLatency(): LatencyAlert[] {
  const alerts: LatencyAlert[] = [];
  for (const entry of _latencyMap.values()) {
    if (entry.p95 >= LATENCY_CRIT_MS) {
      alerts.push({ endpoint: entry.endpoint, chain: entry.chain, p95: entry.p95, severity: 'critical' });
    } else if (entry.p95 >= LATENCY_WARN_MS) {
      alerts.push({ endpoint: entry.endpoint, chain: entry.chain, p95: entry.p95, severity: 'warn' });
    }
  }
  return alerts;
}

export function avgGlobalLatencyMs(): number {
  const all = [..._latencyMap.values()];
  if (all.length === 0) return 0;
  return all.reduce((s, e) => s + e.p50, 0) / all.length;
}
