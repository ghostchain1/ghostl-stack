import type { Alert, LogEvent } from '@ghostchain/types/observability';

export interface MetricsService {
  listTargets(): Promise<{ name: string; url: string }[]>;
}

export interface LogsService {
  search(query?: string): Promise<LogEvent[]>;
}

export interface AlertRulesService {
  list(): Promise<Alert[]>;
}

export interface NotificationRouterService {
  list(): Promise<{ target: string; channel: 'slack' | 'discord' | 'webhook' | 'email'; active: boolean }[]>;
}
