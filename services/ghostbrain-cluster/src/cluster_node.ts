/**
 * GhostBrain Cluster — Cluster Node Identity & Peer Registry
 *
 * Maintains the local node's identity and a registry of all known peers
 * (both cluster peers and agent nodes).
 */

import { hostname } from "node:os";
import type { NodeMetrics } from "./types.js";

export const CLUSTER_NODE_ID  = process.env.CLUSTER_NODE_ID  ?? `cluster-${hostname()}`;
export const CLUSTER_NODE_URL = process.env.CLUSTER_NODE_URL ?? `http://127.0.0.1:${process.env.CLUSTER_PORT ?? "7902"}`;
export const CLUSTER_PRIORITY = parseInt(process.env.CLUSTER_PRIORITY ?? "0", 10);

// ── Peer types ────────────────────────────────────────────────────────────────

export interface ClusterPeer {
  nodeId:    string;
  url:       string;
  lastSeen:  number;
  priority:  number;
  isLeader:  boolean;
  metrics?:  NodeMetrics;
}

export interface AgentNode {
  nodeId:      string;
  agentUrl:    string;
  lastSeen:    number;
  metrics?:    NodeMetrics;
  vmCount:     number;
  containerCount: number;
}

// ── Registries ────────────────────────────────────────────────────────────────

const _clusterPeers = new Map<string, ClusterPeer>();
const _agentNodes   = new Map<string, AgentNode>();

const STALE_THRESHOLD_MS = 60_000; // remove entries not seen for 60 s

function pruneStale(): void {
  const cutoff = Date.now() - STALE_THRESHOLD_MS;
  for (const [id, p] of _clusterPeers) { if (p.lastSeen < cutoff) _clusterPeers.delete(id); }
  for (const [id, a] of _agentNodes)   { if (a.lastSeen < cutoff) _agentNodes.delete(id); }
}

// ── Cluster peers ─────────────────────────────────────────────────────────────

export function upsertClusterPeer(peer: Omit<ClusterPeer, "lastSeen"> & { lastSeen?: number }): void {
  _clusterPeers.set(peer.nodeId, { ...peer, lastSeen: peer.lastSeen ?? Date.now() });
}

export function getClusterPeers(): ClusterPeer[] {
  pruneStale();
  return [..._clusterPeers.values()];
}

export function getClusterPeer(nodeId: string): ClusterPeer | undefined {
  return _clusterPeers.get(nodeId);
}

/** Seed from CLUSTER_PEERS env (comma-separated URLs) */
export function seedPeersFromEnv(): void {
  const raw = process.env.CLUSTER_PEERS ?? "";
  if (!raw.trim()) return;
  for (const url of raw.split(",").map(s => s.trim())) {
    if (!url) continue;
    // nodeId unknown until first gossip; use url as temp key
    const id = `pending-${Buffer.from(url).toString("base64").slice(0, 8)}`;
    if (!_clusterPeers.has(id)) {
      _clusterPeers.set(id, { nodeId: id, url, lastSeen: 0, priority: 0, isLeader: false });
    }
  }
}

// ── Agent nodes ───────────────────────────────────────────────────────────────

export function upsertAgentNode(agent: Omit<AgentNode, "lastSeen"> & { lastSeen?: number }): void {
  _agentNodes.set(agent.nodeId, { ...agent, lastSeen: agent.lastSeen ?? Date.now() });
}

export function getAgentNodes(): AgentNode[] {
  pruneStale();
  return [..._agentNodes.values()];
}

export function getAgentNode(nodeId: string): AgentNode | undefined {
  return _agentNodes.get(nodeId);
}

// ── Aggregate metrics ─────────────────────────────────────────────────────────

export interface ClusterSummary {
  clusterNodeId: string;
  clusterPeerCount: number;
  agentNodeCount: number;
  totalVms: number;
  totalContainers: number;
  avgCpuPercent: number;
  avgMemPercent: number;
  maxCpuPercent: number;
  maxMemPercent: number;
  ts: number;
}

export function getClusterSummary(): ClusterSummary {
  const agents = getAgentNodes();
  const cpus   = agents.map(a => a.metrics?.cpu.usagePercent ?? 0);
  const mems   = agents.map(a => a.metrics?.memory.usagePercent ?? 0);
  const avg    = (arr: number[]) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
  const max    = (arr: number[]) => arr.length ? Math.max(...arr) : 0;
  return {
    clusterNodeId:    CLUSTER_NODE_ID,
    clusterPeerCount: getClusterPeers().length,
    agentNodeCount:   agents.length,
    totalVms:         agents.reduce((s, a) => s + a.vmCount, 0),
    totalContainers:  agents.reduce((s, a) => s + a.containerCount, 0),
    avgCpuPercent:    avg(cpus),
    avgMemPercent:    avg(mems),
    maxCpuPercent:    max(cpus),
    maxMemPercent:    max(mems),
    ts:               Date.now(),
  };
}
