// logger.ts — GhostStack AI Secure Logger (main class)
// SPDX-License-Identifier: MIT
//
// Drop-in replacement for console/pino in any GhostStack AI service or bot.
//
// Features:
//   • Three-layer secret redaction (field name + runtime values + heuristics)
//   • HMAC-SHA256 per-entry signing (tamper detection)
//   • AI-semantic event types (audit, anomaly, decision, attestation, etc.)
//   • Async ring buffer with periodic NATS flush
//   • Token-bucket rate limiter (audit/security events always bypass)
//   • Correlation ID propagation (traceId, spanId, correlationId, incidentId)
//   • Stdout fallback when NATS unavailable
//   • Graceful drain on shutdown

import { randomUUID } from 'node:crypto';
import type {
  GhostLogEntry,
  GhostLoggerConfig,
  AiLogEvent,
  LogLevel,
  TraceContext,
} from './types.js';
import {
  redactObject,
  redactString,
  registerRedactValues,
  registerRedactValue,
} from './redact.js';
import { signEntry } from './hmac.js';
import { RateLimiter } from './rate-limiter.js';
import { LogBuffer } from './buffer.js';
import { NatsPublisher } from './nats-publisher.js';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0, info: 1, warn: 2, error: 3,
};

// Monotonic sequence counter per process
let _seq = 0;

/** Helper payload passed to every log method */
export type LogMeta = Record<string, unknown>;

export class GhostLogger {
  private readonly cfg:      GhostLoggerConfig;
  private readonly limiter:  RateLimiter;
  private readonly buffer:   LogBuffer;
  private readonly nats:     NatsPublisher | null;
  private readonly minLevel: number;
  private readonly extraFields: Set<string>;
  private _trace: TraceContext = {};

  constructor(config: GhostLoggerConfig) {
    this.cfg = config;
    this.minLevel = LEVEL_ORDER[config.minLevel ?? 'debug'];

    // Register all configured redact values globally (affects all loggers)
    if (config.redactValues?.length) {
      registerRedactValues(config.redactValues);
    }

    this.extraFields = new Set(config.redactFields ?? []);

    this.limiter = new RateLimiter(config.rateLimit ?? 0);

    // NATS publisher (optional)
    this.nats = config.natsUrl ? new NatsPublisher(config.natsUrl, config.origin.service) : null;

    // Buffer flushes to NATS (and stdout if alwaysStdout)
    this.buffer = new LogBuffer(
      config.bufferSize ?? 512,
      1000, // flush every 1s
      async (entries) => {
        if (this.nats?.ready) {
          this.nats.publishBatch(entries);
        }
        if (config.alwaysStdout || !this.nats?.ready) {
          for (const e of entries) {
            const stream = e.level === 'error' || e.level === 'warn' ? process.stderr : process.stdout;
            stream.write(JSON.stringify(e) + '\n');
          }
        }
      },
    );
  }

  /** Connect to NATS and start buffer timer — call once during service boot */
  async connect(): Promise<void> {
    if (this.nats) await this.nats.connect();
    this.buffer.start();
  }

  /** Gracefully drain buffer and disconnect NATS — call on SIGTERM */
  async drain(): Promise<void> {
    await this.buffer.drain();
    if (this.nats) await this.nats.drain();
  }

  /** Set the active trace context (carried on all subsequent entries) */
  setTrace(ctx: TraceContext): void {
    this._trace = { ...ctx };
  }

  /** Clear trace context */
  clearTrace(): void {
    this._trace = {};
  }

  /** Register a runtime secret value that must never appear in log output */
  registerSecret(value: string): void {
    registerRedactValue(value);
  }

  // ─── Core log method ─────────────────────────────────────────────────────

  private _log(
    level:   LogLevel,
    event:   AiLogEvent,
    msg:     string,
    data?:   LogMeta,
  ): void {
    if (LEVEL_ORDER[level] < this.minLevel) return;
    if (!this.limiter.allow(event)) return; // rate-limited (audit/security bypass)

    const entry: GhostLogEntry = {
      ts:     new Date().toISOString(),
      level,
      event,
      seq:    ++_seq,
      origin: { ...this.cfg.origin },
      msg:    redactString(msg),
      ...(Object.keys(this._trace).length > 0 ? { trace: { ...this._trace } } : {}),
      ...(data ? { data: redactObject(data, this.extraFields) as Record<string, unknown> } : {}),
    };

    if (this.cfg.hmacSecret) {
      signEntry(entry, this.cfg.hmacSecret);
    }

    // For 'audit' and 'security' events: write synchronously first, then buffer
    if (event === 'audit' || event === 'security' || event === 'attestation') {
      const stream = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
      stream.write(JSON.stringify(entry) + '\n');
      if (this.nats?.ready) this.nats.publishEntry(entry);
      return;
    }

    this.buffer.push(entry);
  }

  // ─── Standard levels ─────────────────────────────────────────────────────

  debug(msg: string, data?: LogMeta):  void { this._log('debug', 'general',  msg, data); }
  info(msg: string, data?: LogMeta):   void { this._log('info',  'general',  msg, data); }
  warn(msg: string, data?: LogMeta):   void { this._log('warn',  'general',  msg, data); }
  error(msg: string, data?: LogMeta):  void { this._log('error', 'general',  msg, data); }

  // ─── AI-semantic event helpers ───────────────────────────────────────────

  /** Immutable audit record — always written synchronously and NATS-published */
  audit(msg: string, data?: LogMeta): void {
    this._log('info', 'audit', msg, data);
  }

  /** Detected anomaly — triggers anomaly counter in ghost-secure-logger */
  anomaly(msg: string, data?: LogMeta): void {
    this._log('warn', 'anomaly', msg, data);
  }

  /** AI-generated insight or recommendation */
  insight(msg: string, data?: LogMeta): void {
    this._log('info', 'insight', msg, data);
  }

  /** Autonomous decision taken — records action for governance review */
  decision(msg: string, data?: LogMeta): void {
    this._log('info', 'decision', msg, data);
  }

  /** Cryptographic attestation produced */
  attest(msg: string, data?: LogMeta): void {
    this._log('info', 'attestation', msg, data);
  }

  /** Security event (auth failure, routing violation, tamper attempt) */
  security(msg: string, data?: LogMeta): void {
    this._log('warn', 'security', msg, data);
  }

  /** Policy gate decision */
  policy(msg: string, data?: LogMeta): void {
    this._log('info', 'policy', msg, data);
  }

  /** Secret / key rotation event */
  rotation(msg: string, data?: LogMeta): void {
    this._log('info', 'rotation', msg, data);
  }

  /** Auto-remediation action */
  remediation(msg: string, data?: LogMeta): void {
    this._log('info', 'remediation', msg, data);
  }

  /** Periodic heartbeat from an AI system */
  heartbeat(data?: LogMeta): void {
    this._log('debug', 'heartbeat', 'heartbeat', data);
  }

  // ─── Child logger ────────────────────────────────────────────────────────

  /**
   * Create a child logger with additional fixed metadata.
   * The child shares the same buffer, limiter, and NATS connection.
   */
  child(fixedMeta: LogMeta): ChildLogger {
    return new ChildLogger(this, fixedMeta);
  }
}

/** Thin wrapper that pre-merges fixed metadata into every log call */
export class ChildLogger {
  constructor(private readonly parent: GhostLogger, private readonly fixed: LogMeta) {}

  private m(data?: LogMeta): LogMeta {
    return data ? { ...this.fixed, ...data } : { ...this.fixed };
  }

  debug(msg: string, data?: LogMeta): void       { this.parent.debug(msg, this.m(data)); }
  info(msg: string, data?: LogMeta): void        { this.parent.info(msg, this.m(data)); }
  warn(msg: string, data?: LogMeta): void        { this.parent.warn(msg, this.m(data)); }
  error(msg: string, data?: LogMeta): void       { this.parent.error(msg, this.m(data)); }
  audit(msg: string, data?: LogMeta): void       { this.parent.audit(msg, this.m(data)); }
  anomaly(msg: string, data?: LogMeta): void     { this.parent.anomaly(msg, this.m(data)); }
  insight(msg: string, data?: LogMeta): void     { this.parent.insight(msg, this.m(data)); }
  decision(msg: string, data?: LogMeta): void    { this.parent.decision(msg, this.m(data)); }
  attest(msg: string, data?: LogMeta): void      { this.parent.attest(msg, this.m(data)); }
  security(msg: string, data?: LogMeta): void    { this.parent.security(msg, this.m(data)); }
  policy(msg: string, data?: LogMeta): void      { this.parent.policy(msg, this.m(data)); }
  rotation(msg: string, data?: LogMeta): void    { this.parent.rotation(msg, this.m(data)); }
  remediation(msg: string, data?: LogMeta): void { this.parent.remediation(msg, this.m(data)); }
  heartbeat(data?: LogMeta): void                { this.parent.heartbeat(this.m(data)); }
}

// ─── Factory helper ───────────────────────────────────────────────────────────

/**
 * Creates a GhostLogger and calls connect() automatically.
 * Use this in service entry points for zero-boilerplate setup.
 *
 * @example
 * const log = await createLogger({ origin: { service: 'my-ai-bot', layer: 'L2' } });
 * log.audit('Bot started');
 */
export async function createLogger(cfg: GhostLoggerConfig): Promise<GhostLogger> {
  const logger = new GhostLogger(cfg);
  await logger.connect();
  return logger;
}

/** Generate a fresh correlation ID */
export function newCorrelationId(): string {
  return randomUUID();
}
