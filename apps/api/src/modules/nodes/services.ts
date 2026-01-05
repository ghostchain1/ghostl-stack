import type { Node, NodeMetrics } from '../../../../../packages/types';

export interface NodeInventoryService {
  list(): Promise<Node[]>;
  get(id: string): Promise<Node | null>;
  create(input: Omit<Node, 'id' | 'status' | 'lastSeenAt'>): Promise<Node>;
  update(id: string, input: Partial<Node>): Promise<Node>;
}

export interface NodeHealthService {
  getHealth(id: string): Promise<NodeMetrics>;
  getLogs(id: string, tail?: number): Promise<string[]>;
}

export interface UpgradeOrchestratorService {
  planUpgrade(targetVersion: string, nodeIds: string[]): Promise<{ planId: string }>;
  apply(planId: string): Promise<void>;
  rollback(planId: string): Promise<void>;
}

export interface SnapshotService {
  list(nodeId?: string): Promise<{ id: string; createdAt: string; sizeBytes?: number }[]>;
  create(nodeId: string): Promise<{ id: string }>;
  prune(nodeId: string, snapshotId: string): Promise<void>;
}
