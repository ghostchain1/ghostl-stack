import type { Alert, LogEvent } from '../../../../../packages/types';

export interface MetricsService {
  queryPrometheus(query: string): Promise<unknown>;
  queryPrometheusRange(query: string, startMs: number, endMs: number, stepSeconds?: number): Promise<unknown>;
  listDashboards(): Promise<{ id: string; name: string; url: string }[]>;
}

export interface LogsService {
  search(query: string, limit?: number, startMs?: number, endMs?: number): Promise<LogEvent[]>;
  tail(source: string, onEvent: (event: LogEvent) => void): () => void;
}

export interface AlertRulesService {
  list(): Promise<Alert[]>;
  create(rule: Omit<Alert, 'id' | 'state' | 'firedAt'>): Promise<Alert>;
  resolve(id: string): Promise<void>;
}

export interface NotificationRouterService {
  listChannels(): Promise<{ id: string; type: string; target: string }[]>;
  send(alert: Alert, channels: string[]): Promise<void>;
}

export interface AuditLog {
  append(entry: { actorId: string; action: string; resource: string; meta?: Record<string, unknown> }): Promise<unknown>;
}

export interface NotificationChannel {
  id: string;
  type: 'slack' | 'webhook' | 'discord' | 'email';
  target: string;
  meta?: Record<string, unknown>;
}
