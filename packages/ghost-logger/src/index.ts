// index.ts — Public exports for @ghost/logger
// SPDX-License-Identifier: MIT

export type {
  GhostLogEntry,
  GhostLogEnvelope,
  GhostLogBundle,
  GhostLoggerConfig,
  AiLogEvent,
  LogLevel,
  LogOrigin,
  TraceContext,
} from './types.js';

export {
  GhostLogger,
  ChildLogger,
  createLogger,
  newCorrelationId,
  type LogMeta,
} from './logger.js';

export {
  redact,
  redactString,
  redactObject,
  registerRedactValue,
  registerRedactValues,
  clearRedactValues,
} from './redact.js';

export { signEntry, verifyEntry, chainHmac } from './hmac.js';
export { RateLimiter } from './rate-limiter.js';
export { LogBuffer } from './buffer.js';
export { NatsPublisher } from './nats-publisher.js';
