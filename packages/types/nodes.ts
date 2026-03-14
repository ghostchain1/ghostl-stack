export type NodeType = 'validator' | 'full' | 'archive' | 'rpc';
export type NodeStatus = 'online' | 'offline' | 'syncing' | 'degraded';

export interface Node {
  id: string;
  type: NodeType;
  host: string;
  version: string;
  status: NodeStatus;
  lastSeenAt?: string;
}

export interface NodeMetrics {
  cpu: number;
  mem: number;
  disk: number;
  iops?: number;
  peers: number;
  lag?: number;
  version?: string;
  expectedVersion?: string;
  versionDrift?: boolean;
}
