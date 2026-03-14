import type { RpcEndpoint, Webhook } from '../../../../../packages/types';

export interface RpcManagerService {
  list(): Promise<RpcEndpoint[]>;
  get(id: string): Promise<RpcEndpoint | null>;
  add(endpoint: Omit<RpcEndpoint, 'id' | 'status' | 'lastCheckedAt'>): Promise<RpcEndpoint>;
  update(id: string, input: Partial<RpcEndpoint>): Promise<RpcEndpoint>;
}

export interface RateLimitService {
  getLimits(id: string): Promise<Record<string, unknown>>;
  setLimits(id: string, limits: Record<string, unknown>): Promise<void>;
}

export interface UsageAnalyticsService {
  getUsage(id: string): Promise<{ requests: number; errors: number; p99LatencyMs: number }>;
  list(): Promise<{ id: string; requests: number; errors: number }[]>;
}

export interface WebhookService {
  list(): Promise<Webhook[]>;
  register(webhook: Omit<Webhook, 'id' | 'createdAt'>): Promise<Webhook>;
  delete(id: string): Promise<void>;
  trigger(id: string, payload: unknown): Promise<void>;
}
