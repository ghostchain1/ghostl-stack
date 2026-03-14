/**
 * @file src/topology/peerAnalyzer.ts
 * Ghost Global Network Intelligence — Peer health analysis utilities.
 *
 * Stateless helpers that interpret a TopologySnapshot.
 * No side effects, no network calls.
 */

import type { TopologySnapshot, NodeInfo } from '../types.js';

export interface PeerAnalysis {
  underPeered:   NodeInfo[];
  offline:       NodeInfo[];
  healthy:       NodeInfo[];
  avgLatencyMs:  number;
  peersOk:       boolean;
}

const PEER_MIN     = parseInt(process.env.GNI_PEER_MIN     ?? '5',  10);
const PEER_OPTIMAL = parseInt(process.env.GNI_PEER_OPTIMAL ?? '25', 10);
const LATENCY_WARN = parseInt(process.env.GNI_LATENCY_WARN ?? '2000', 10);

export function analyzePeers(snapshot: TopologySnapshot): PeerAnalysis {
  const underPeered = snapshot.nodes.filter(n => n.healthy && n.peers < PEER_MIN);
  const offline     = snapshot.nodes.filter(n => !n.healthy);
  const healthy     = snapshot.nodes.filter(n => n.healthy && n.peers >= PEER_MIN);

  const latencies   = snapshot.nodes.filter(n => n.healthy).map(n => n.latencyMs);
  const avgLatencyMs = latencies.length > 0
    ? latencies.reduce((a, b) => a + b, 0) / latencies.length
    : 0;

  return {
    underPeered,
    offline,
    healthy,
    avgLatencyMs,
    peersOk: underPeered.length === 0 && offline.length === 0,
  };
}

export function needsExpansion(snapshot: TopologySnapshot): boolean {
  return snapshot.minPeers < PEER_MIN || snapshot.unhealthyCount > 0;
}

export function summarizePeers(snapshot: TopologySnapshot): string {
  const { nodes, avgPeers, minPeers, unhealthyCount } = snapshot;
  const highLatency = nodes.filter(n => n.healthy && n.latencyMs > LATENCY_WARN).length;
  const lines: string[] = [
    `nodes=${nodes.length} avgPeers=${avgPeers.toFixed(1)} minPeers=${minPeers}`,
    `unhealthy=${unhealthyCount} highLatency=${highLatency}`,
    minPeers < PEER_MIN       ? `UNDER_PEERED (min ${minPeers} < threshold ${PEER_MIN})` : '',
    avgPeers < PEER_OPTIMAL   ? `BELOW_OPTIMAL (avg ${avgPeers.toFixed(1)} < ${PEER_OPTIMAL})` : '',
    highLatency > 0           ? `HIGH_LATENCY_NODES=${highLatency}` : '',
  ].filter(Boolean);
  return lines.join(' | ');
}
