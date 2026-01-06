import type { RpcEndpoint, Webhook } from '@ghostchain/types/integrations';

export interface RpcManagerService {
  list(): Promise<RpcEndpoint[]>;
}

export interface RateLimitService {
  get(): Promise<{ limit: number; windowSeconds: number }>;
  set(limit: number, windowSeconds: number): Promise<void>;
}

export interface UsageAnalyticsService {
  list(): Promise<{ id: string; requests: number; errors: number; p95: number }[]>;
}

export interface WebhookService {
  list(): Promise<Webhook[]>;
}
