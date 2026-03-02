/**
 * logger.ts — Structured logger with automatic secret redaction.
 *
 * Follows the same pattern as services/ghostcontract-ai/src/logger.ts.
 * Any field name in REDACT_KEYS is replaced with "[REDACTED]" before
 * values reach stdout / any log aggregator.
 */

import { REDACT_KEYS } from './config.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 0,
  info:  1,
  warn:  2,
  error: 3,
};

function getConfiguredLevel(): LogLevel {
  const raw = (process.env['LOG_LEVEL'] ?? 'info').toLowerCase();
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') {
    return raw;
  }
  return 'info';
}

function redact(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = REDACT_KEYS.has(k) ? '[REDACTED]' : v;
  }
  return out;
}

function emit(
  level: LogLevel,
  message: string,
  ctx?: Record<string, unknown>,
): void {
  const minLevel = LEVEL_RANK[getConfiguredLevel()];
  if (LEVEL_RANK[level] < minLevel) return;

  const entry = {
    ts:      new Date().toISOString(),
    svc:     'ghost-treasury-ai',
    level,
    message,
    ...(ctx ? redact(ctx) : {}),
  };

  const line = JSON.stringify(entry);
  if (level === 'error') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

export const logger = {
  debug: (msg: string, ctx?: Record<string, unknown>) => emit('debug', msg, ctx),
  info:  (msg: string, ctx?: Record<string, unknown>) => emit('info',  msg, ctx),
  warn:  (msg: string, ctx?: Record<string, unknown>) => emit('warn',  msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => emit('error', msg, ctx),
};
