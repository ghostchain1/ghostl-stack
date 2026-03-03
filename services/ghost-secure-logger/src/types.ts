// types.ts — ghost-secure-logger internal types
// SPDX-License-Identifier: MIT

export type LogLevel  = 'debug' | 'info' | 'warn' | 'error';
export type AiLogEvent =
  | 'audit' | 'anomaly' | 'insight' | 'decision' | 'attestation'
  | 'security' | 'policy' | 'rotation' | 'remediation' | 'heartbeat' | 'general';

export interface LogOrigin {
  service:   string;
  instance?: string;
  layer?:    'L0' | 'L1' | 'L2' | 'L3';
  version?:  string;
}

export interface TraceContext {
  traceId?:       string;
  spanId?:        string;
  correlationId?: string;
  incidentId?:    string;
  planId?:        string;
  requestId?:     string;
}

export interface GhostLogEntry {
  ts:       string;
  level:    LogLevel;
  event:    AiLogEvent;
  origin:   LogOrigin;
  msg:      string;
  trace?:   TraceContext;
  data?:    Record<string, unknown>;
  hmac?:    string;
  seq?:     number;
}

export interface GhostLogEnvelope {
  v:            1;
  entry:        GhostLogEntry;
  origin:       LogOrigin;
  published_at: string;
}

export interface IndexedEntry {
  id:        string;   // ulid-style: ts + seq
  service:   string;
  level:     LogLevel;
  event:     AiLogEvent;
  ts:        string;
  hmacValid: boolean | null;
  raw:       GhostLogEntry;
}

export interface AnomalyAlert {
  ts:        string;
  type:      'error_spike' | 'unknown_source' | 'tamper_detected' | 'flood_detected' | 'security_burst';
  service:   string;
  detail:    string;
  count:     number;
}

export interface Metrics {
  entriesIngested:      number;
  entriesStored:        number;
  bundlesSigned:        number;
  hmacVerifyFail:       number;
  anomalyDetected:      number;
  natsMessagesReceived: number;
  apiRequests:          number;
  errorRate:            number;
  unknownSources:       number;
  lokiPushes:           number;
  lokiPushFails:        number;
}
