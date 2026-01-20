export type AlertSeverity = 'info' | 'warning' | 'critical';
export type AlertState = 'firing' | 'resolved';

export interface Alert {
  id: string;
  severity: AlertSeverity;
  source: string;
  state: AlertState;
  firedAt: string;
  resolvedAt?: string;
  labels?: Record<string, string>;
  message?: string;
}

export interface LogEvent {
  source: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  time: string;
  labels?: Record<string, string>;
}

export type LogSeverity =
  | 'INFO'
  | 'WARN'
  | 'ERROR'
  | 'CRITICAL'
  | 'SLASHING_RISK'
  | 'CONSENSUS_RISK'
  | 'SECURITY_EVENT'
  | 'AI_DECISION';

export type LogLayer = 'L1' | 'L2' | 'L3' | 'INFRA' | 'UNKNOWN';

export interface NormalizedLogEvent {
  id: string;
  timestamp: string;
  timestampNs?: string;
  layer: LogLayer;
  chain: string;
  component: string;
  severity: LogSeverity;
  event: string;
  message: string;
  requestId?: string;
  traceId?: string;
  blockNumber?: number;
  txHash?: string;
  nodeId?: string;
  labels?: Record<string, string>;
  details?: Record<string, unknown>;
  source?: string;
}

export interface LogQuery {
  q?: string;
  layers?: LogLayer[];
  chains?: string[];
  components?: string[];
  severities?: LogSeverity[];
  startMs?: number;
  endMs?: number;
  limit?: number;
}

export interface LogAggregateBucket {
  key: string;
  count: number;
  severityCounts?: Record<LogSeverity, number>;
}

export interface LogAggregateResult {
  total: number;
  buckets: LogAggregateBucket[];
}

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface LogAnomaly {
  id: string;
  score: number;
  reason: string;
  time: string;
  layer?: LogLayer;
  chain?: string;
  component?: string;
  traceId?: string;
}

export interface LogIncident {
  id: string;
  severity: LogSeverity;
  title: string;
  summary: string;
  start: string;
  end?: string;
  layer?: LogLayer;
  chain?: string;
  component?: string;
  traceId?: string;
  eventIds?: string[];
}

export interface AIExplanation {
  id: string;
  summary: string;
  confidence: number;
  evidence: string[];
  metrics?: Record<string, number>;
}

export interface LogInsightReport {
  generatedAt: string;
  riskLevel: RiskLevel;
  incidents: LogIncident[];
  anomalies: LogAnomaly[];
  explanations: AIExplanation[];
  recommendedActions: string[];
}
