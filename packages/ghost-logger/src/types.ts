// types.ts — GhostStack AI Secure Logger type definitions
// SPDX-License-Identifier: MIT

/** Standard log levels */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * AI-specific semantic log event types that augment standard levels.
 * These drive anomaly detection, dashboards, and audit chains.
 */
export type AiLogEvent =
  | 'audit'        // Immutable audit record (always persisted + signed)
  | 'anomaly'      // Detected anomaly / unexpected behaviour
  | 'insight'      // AI-generated inference or recommendation
  | 'decision'     // Autonomous decision taken (action record)
  | 'attestation'  // Cryptographic attestation produced
  | 'security'     // Security event (auth failure, routing violation, etc.)
  | 'policy'       // Policy gate decision
  | 'rotation'     // Secret / key rotation event
  | 'remediation'  // Auto-remediation action applied
  | 'heartbeat'    // Periodic liveness ping from an AI system
  | 'general';     // Default catch-all

/** Identity of the service emitting the log */
export interface LogOrigin {
  service:   string;
  instance?: string;   // pod/container ID
  layer?:    'L0' | 'L1' | 'L2' | 'L3';
  version?:  string;
}

/** Distributed tracing correlation context */
export interface TraceContext {
  traceId?:       string;
  spanId?:        string;
  correlationId?: string;
  incidentId?:    string;
  planId?:        string;
  requestId?:     string;
}

/**
 * Core log entry — everything logged by a GhostStack AI system.
 * The `hmac` field is populated by the logger before transmission.
 */
export interface GhostLogEntry {
  // Core fields
  ts:        string;         // ISO-8601
  level:     LogLevel;
  event:     AiLogEvent;
  origin:    LogOrigin;
  msg:       string;

  // Tracing
  trace?:    TraceContext;

  // Structured payload (AI-specific data)
  data?:     Record<string, unknown>;

  // Integrity
  hmac?:     string;         // HMAC-SHA256 of canonical form (excluding this field)
  seq?:      number;         // Monotonic per-origin sequence number

  // Redaction marker
  _redacted?: true;
}

/** Published to NATS subject `ghostlog.ingest.<service>` */
export interface GhostLogEnvelope {
  v:       1;
  entry:   GhostLogEntry;
  origin:  LogOrigin;
  published_at: string;
}

/** Log bundle — signed collection used for audit chain */
export interface GhostLogBundle {
  id:           string;
  service:      string;
  from:         string;
  to:           string;
  entry_count:  number;
  hmac_chain:   string;   // HMAC over all entry HMACs in order
  entries:      GhostLogEntry[];
  signed_at:    string;
}

/** Rate limiter token-bucket state */
export interface RateLimiterState {
  tokens:      number;
  lastRefill:  number;
}

/** Logger configuration */
export interface GhostLoggerConfig {
  /** Service identity */
  origin:          LogOrigin;
  /** Minimum level to emit; entries below this are dropped */
  minLevel?:       LogLevel;
  /** NATS URL — omit to disable NATS publishing */
  natsUrl?:        string;
  /** HMAC secret key for signing entries */
  hmacSecret?:     string;
  /** Extra field names whose values must always be redacted */
  redactFields?:   string[];
  /** Extra raw values (secrets) that must never appear in logs */
  redactValues?:   string[];
  /** Max log entries per second (0 = unlimited) */
  rateLimit?:      number;
  /** Async buffer size (number of entries) before back-pressure */
  bufferSize?:     number;
  /** Emit to stdout even when NATS is active */
  alwaysStdout?:   boolean;
  /** Log level for the logger's own internal messages */
  selfLogLevel?:   LogLevel;
}
