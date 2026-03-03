// logger.ts — structured JSON logger with automatic secret redaction
// Per AGENTS.md §6: never log private keys, mnemonics, tokens, or credentials.

import { CFG } from './config.js';

type Level = 'debug' | 'info' | 'warn' | 'error';

const REDACT_VALUES = new Set<string>();

// Populate redacted values at startup from known env vars
for (const field of CFG.redactFields) {
  const val = process.env[field];
  if (val && val.length > 3) REDACT_VALUES.add(val);
}

function redact(input: unknown): unknown {
  try {
    let s = typeof input === 'string' ? input : JSON.stringify(input);
    for (const secret of REDACT_VALUES) {
      s = s.replaceAll(secret, '[REDACTED]');
    }
    return s === input ? input : s;
  } catch {
    return input;
  }
}

function log(level: Level, msg: string, extra?: Record<string, unknown>): void {
  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    service: CFG.serviceName,
    msg: redact(msg) as string,
  };
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      // Skip any field whose name matches a redact pattern
      if (CFG.redactFields.some(f => k.toLowerCase().includes(f.toLowerCase()))) {
        entry[k] = '[REDACTED]';
      } else {
        entry[k] = redact(v);
      }
    }
  }
  // Write to stdout (Docker/container logging standard)
  (level === 'error' || level === 'warn' ? process.stderr : process.stdout)
    .write(JSON.stringify(entry) + '\n');
}

export const logger = {
  debug: (msg: string, extra?: Record<string, unknown>) => log('debug', msg, extra),
  info:  (msg: string, extra?: Record<string, unknown>) => log('info',  msg, extra),
  warn:  (msg: string, extra?: Record<string, unknown>) => log('warn',  msg, extra),
  error: (msg: string, extra?: Record<string, unknown>) => log('error', msg, extra),
  /** Register an additional secret value to redact at runtime */
  registerSecret: (value: string) => {
    if (value && value.length > 3) REDACT_VALUES.add(value);
  },
};
