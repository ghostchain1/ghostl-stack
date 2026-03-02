/**
 * GhostBrain Core — Structured Logger
 *
 * JSON-line logs with correlation ID support.
 * SECURITY: Key material must NEVER be passed to any log method.
 *           The REDACT list is applied automatically.
 */

import { SERVICE_NAME } from "./config.js";

type LogLevel = "debug" | "info" | "warn" | "error";

type LogEntry = {
  ts: string;
  level: LogLevel;
  service: string;
  correlationId?: string;
  incidentId?: string;
  planId?: string;
  msg: string;
  [key: string]: unknown;
};

// ─── Correlation context ──────────────────────────────────────────────────────
let _correlationId: string | undefined;
let _incidentId: string | undefined;
let _planId: string | undefined;

export function setCorrelation(cid: string, iid?: string, pid?: string): void {
  _correlationId = cid;
  _incidentId    = iid;
  _planId        = pid;
}

export function clearCorrelation(): void {
  _correlationId = undefined;
  _incidentId    = undefined;
  _planId        = undefined;
}

// ─── Redaction ────────────────────────────────────────────────────────────────
const REDACT = new Set([
  "key", "privateKey", "secret", "token", "password", "mnemonic",
  "seed", "pk", "signer", "vaultToken", "signerKey", "rpcAuth",
  "apiKey", "bearer", "credential", "accessKey", "secretKey",
]);

function _redact(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (REDACT.has(k)) {
      out[k] = "[REDACTED]";
    } else if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      out[k] = _redact(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

// ─── Writer ───────────────────────────────────────────────────────────────────
function write(level: LogLevel, msg: string, meta?: Record<string, unknown>): void {
  const entry: LogEntry = {
    ts:      new Date().toISOString(),
    level,
    service: SERVICE_NAME,
    msg,
    ...(_correlationId ? { correlationId: _correlationId } : {}),
    ...(_incidentId    ? { incidentId:    _incidentId }    : {}),
    ...(_planId        ? { planId:        _planId }        : {}),
    ...(meta ?? {}),
  };
  process.stdout.write(JSON.stringify(_redact(entry)) + "\n");
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => write("debug", msg, meta),
  info:  (msg: string, meta?: Record<string, unknown>) => write("info",  msg, meta),
  warn:  (msg: string, meta?: Record<string, unknown>) => write("warn",  msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => write("error", msg, meta),
};
