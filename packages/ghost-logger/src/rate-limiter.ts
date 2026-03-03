// rate-limiter.ts — Token-bucket rate limiter for log emission
// SPDX-License-Identifier: MIT
//
// Prevents log flooding from runaway AI loops.
// audit + security events ALWAYS bypass the limiter.

import type { AiLogEvent } from './types.js';

/** Events that are never rate-limited */
const BYPASS_EVENTS: Set<AiLogEvent> = new Set([
  'audit', 'security', 'attestation', 'anomaly',
]);

export class RateLimiter {
  private tokens:     number;
  private lastRefill: number;
  private readonly max:          number;
  private readonly refillPerMs:  number;

  /** @param ratePerSecond Max tokens (log entries) per second. 0 = unlimited. */
  constructor(ratePerSecond: number) {
    this.max         = ratePerSecond > 0 ? ratePerSecond : Infinity;
    this.tokens      = this.max;
    this.lastRefill  = Date.now();
    this.refillPerMs = ratePerSecond > 0 ? ratePerSecond / 1000 : 0;
  }

  /** Returns true if the entry should be allowed through */
  allow(event: AiLogEvent): boolean {
    if (this.max === Infinity) return true;
    if (BYPASS_EVENTS.has(event)) return true;

    const now = Date.now();
    const elapsed = now - this.lastRefill;
    this.tokens = Math.min(this.max, this.tokens + elapsed * this.refillPerMs);
    this.lastRefill = now;

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  get available(): number {
    return Math.floor(this.tokens);
  }
}
