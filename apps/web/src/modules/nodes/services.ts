import type { Node, NodeMetrics } from '@ghostl/types/nodes';

export interface NodeInventoryService {
  list(): Promise<Node[]>;
  get(id: string): Promise<Node | null>;
}

export interface NodeHealthService {
  getMetrics(id: string): Promise<NodeMetrics | null>;
  getLogs(id: string, lines?: number): Promise<string>;
}

export interface UpgradeOrchestratorService {
  plan(id: string, version: string, window?: string): Promise<void>;
  apply(id: string): Promise<void>;
  rollback(id: string): Promise<void>;
}

export interface SnapshotService {
  list(id: string): Promise<{ id: string; createdAt: string; type: 'full' | 'pruned'; sizeGb?: number }[]>;
}
