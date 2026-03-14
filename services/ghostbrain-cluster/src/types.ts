/**
 * GhostBrain Cluster — Shared Types
 */

export interface NodeMetrics {
  nodeId:    string;
  timestamp: number;
  cpu:       { usagePercent: number; iowaitPercent: number; cores: number };
  memory:    { totalMb: number; usedMb: number; usagePercent: number; swapUsedMb: number };
  disk:      { readKbps: number; writeKbps: number; ioSaturationPercent: number };
  network:   { rxKbps: number; txKbps: number; errors: number };
}

export interface GossipMessage {
  nodeId:   string;
  nodeUrl:  string;
  priority: number;
  version:  number;
  metrics?: NodeMetrics;
  peers:    { nodeId: string; url: string; lastSeen: number; priority: number }[];
  ts:       number;
}

export interface HeartbeatMessage {
  nodeId:   string;
  nodeUrl:  string;
  priority: number;
  isLeader: boolean;
  term:     number;
  ts:       number;
}
