/**
 * GhostContractAI — Structured Logger
 *
 * Outputs JSON-line logs with correlation ID support.
 * SECURITY: Key material must never be passed to any log method.
 */

import { SERVICE_NAME } from "./config.js";

type LogLevel = "debug" | "info" | "warn" | "error";

type LogEntry = {
  ts: string;
  level: LogLevel;
  service: string;
  correlationId?: string;
  pipelineId?: string;
  msg: string;
  [key: string]: unknown;
};

let currentCorrelationId: string | undefined;
let currentPipelineId: string | undefined;

export function setCorrelation(cid: string, pid?: string): void {
  currentCorrelationId = cid;
  currentPipelineId    = pid;
}

export function clearCorrelation(): void {
  currentCorrelationId = undefined;
  currentPipelineId    = undefined;
}

function write(level: LogLevel, msg: string, meta?: Record<string, unknown>): void {
  const entry: LogEntry = {
    ts:    new Date().toISOString(),
    level,
    service: SERVICE_NAME,
    msg,
    ...(currentCorrelationId ? { correlationId: currentCorrelationId } : {}),
    ...(currentPipelineId    ? { pipelineId:    currentPipelineId    } : {}),
    ...(meta ?? {}),
  };

  // Redact common secret field names before outputting.
  const safe = _redact(entry);
  process.stdout.write(JSON.stringify(safe) + "\n");
}

const SECRET_KEYS = new Set([
  "key", "privateKey", "secret", "token", "password", "mnemonic",
  "seed", "pk", "signer", "vaultToken", "signerKey",
]);

function _redact(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SECRET_KEYS.has(k)) {
      out[k] = "[REDACTED]";
    } else if (v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = _redact(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => write("debug", msg, meta),
  info:  (msg: string, meta?: Record<string, unknown>) => write("info",  msg, meta),
  warn:  (msg: string, meta?: Record<string, unknown>) => write("warn",  msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => write("error", msg, meta),
};
