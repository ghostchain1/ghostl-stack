export type AnalyticsEventScope = 'ai' | 'integrations' | 'auth' | 'webhook' | 'analytics';
export type AnalyticsEventStatus = 'ok' | 'error';

export type AnalyticsEvent = {
  id: string;
  scope: AnalyticsEventScope;
  type: string;
  status: AnalyticsEventStatus;
  actorId?: string;
  payload?: Record<string, unknown>;
  at: string;
};

export type WebhookStatusSummary = {
  total24h: number;
  failures24h: number;
  lastDeliveryAt?: string;
  lastError?: string;
};
