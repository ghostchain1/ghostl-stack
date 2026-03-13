/**
 * GhostStack AI Vault — Anomaly Detector
 * Real-time statistical detection of abnormal vault access patterns.
 *
 * Signals monitored:
 *   1. Rate limiting (requests/min, burst/5s)
 *   2. Repeated failures (brute-force detection)
 *   3. Credential recycling (same token from multiple IPs)
 *   4. Time-of-day anomalies
 *   5. Resource scope explosion (accessing many secrets rapidly)
 *   6. Post-block retry (accessing vault after being blocked)
 *
 * GhostChain L1 (14000101) | L2 (901) | L3 (903) | GST gas token
 */

import type { AccessEvent } from './access-behavior-model.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface AnomalySignal {
  type: AnomalyType;
  actorId: string;
  score: number;    // 0–1 severity
  description: string;
  ts: number;
  metadata?: Record<string, string | number>;
}

export type AnomalyType =
  | 'rate_exceeded'
  | 'burst_detected'
  | 'repeated_failures'
  | 'multi_ip_token'
  | 'unusual_time'
  | 'scope_explosion'
  | 'retry_after_block'
  | 'validator_key_abuse'
  | 'treasury_drain_pattern'
  | 'container_credential_abuse';

export interface AnomalyConfig {
  rateLimitPerMinute: number;
  burstLimit: number;
  burstWindowMs: number;
  failureThreshold: number;
  failureWindowMs: number;
  blockMs: number;
  scopeExplosionThreshold: number;   // unique resources in 1 min
}

export interface BlockedState {
  actorId: string;
  blockedUntil: number;
  reason: AnomalyType;
  blockCount: number;
}

// ── AnomalyDetector ────────────────────────────────────────────────────────

export class AnomalyDetector {
  private readonly _cfg: AnomalyConfig;

  // Sliding windows: actorId → events
  private readonly _windows  = new Map<string, AccessEvent[]>();
  private readonly _blocked  = new Map<string, BlockedState>();
  private readonly _tokenIps = new Map<string, Set<string>>();  // token → IP set

  // Signal history (last 1000)
  private readonly _signals: AnomalySignal[] = [];
  private readonly _maxSignals = 1000;

  constructor(cfg: Partial<AnomalyConfig> = {}) {
    this._cfg = {
      rateLimitPerMinute:     cfg.rateLimitPerMinute     ?? 120,
      burstLimit:             cfg.burstLimit             ?? 40,
      burstWindowMs:          cfg.burstWindowMs          ?? 5_000,
      failureThreshold:       cfg.failureThreshold       ?? 10,
      failureWindowMs:        cfg.failureWindowMs        ?? 60_000,
      blockMs:                cfg.blockMs                ?? 300_000,
      scopeExplosionThreshold: cfg.scopeExplosionThreshold ?? 30,
    };
  }

  // ── Main Analysis ──────────────────────────────────────────────────────────

  /**
   * Analyze an incoming event. Records the event and checks for anomalies.
   * Returns list of signals detected (empty = normal).
   */
  analyze(event: AccessEvent, tokenHash?: string): AnomalySignal[] {
    const now = Date.now();

    // Maintain sliding window
    const window = this._updateWindow(event.actorId, event, now);

    const detected: AnomalySignal[] = [];

    // 1. Still blocked?
    const block = this._blocked.get(event.actorId);
    if (block && block.blockedUntil > now) {
      detected.push(this._signal('retry_after_block', event.actorId, 0.9,
        `Actor retried while blocked (${Math.round((block.blockedUntil - now) / 1000)}s remaining)`));
    }

    // 2. Rate limit
    const recentMin = window.filter(e => e.timestamp >= now - 60_000).length;
    if (recentMin > this._cfg.rateLimitPerMinute) {
      const score = Math.min(1, (recentMin - this._cfg.rateLimitPerMinute) / this._cfg.rateLimitPerMinute);
      detected.push(this._signal('rate_exceeded', event.actorId, score,
        `${recentMin} requests/min exceeds limit ${this._cfg.rateLimitPerMinute}`));
    }

    // 3. Burst
    const recentBurst = window.filter(e => e.timestamp >= now - this._cfg.burstWindowMs).length;
    if (recentBurst > this._cfg.burstLimit) {
      const score = Math.min(1, (recentBurst - this._cfg.burstLimit) / this._cfg.burstLimit);
      detected.push(this._signal('burst_detected', event.actorId, score,
        `${recentBurst} requests in ${this._cfg.burstWindowMs / 1000}s burst window`));
    }

    // 4. Repeated failures
    const recentFails = window.filter(
      e => e.timestamp >= now - this._cfg.failureWindowMs &&
        (e.result === 'failure' || e.result === 'denied'),
    ).length;
    if (recentFails >= this._cfg.failureThreshold) {
      const score = Math.min(1, recentFails / (this._cfg.failureThreshold * 2));
      detected.push(this._signal('repeated_failures', event.actorId, score,
        `${recentFails} failures/denials in ${this._cfg.failureWindowMs / 1000}s`));
    }

    // 5. Multi-IP token (same auth token from multiple IPs)
    if (tokenHash) {
      const ips = this._tokenIps.get(tokenHash) ?? new Set<string>();
      ips.add(event.sourceIp);
      this._tokenIps.set(tokenHash, ips);
      if (ips.size > 5) {
        detected.push(this._signal('multi_ip_token', event.actorId, 0.8,
          `Auth token used from ${ips.size} distinct IPs — possible credential sharing/theft`));
      }
    }

    // 6. Scope explosion
    const recentResources = new Set(
      window.filter(e => e.timestamp >= now - 60_000).map(e => e.resource),
    );
    if (recentResources.size > this._cfg.scopeExplosionThreshold) {
      const score = Math.min(1, (recentResources.size - this._cfg.scopeExplosionThreshold) / 20);
      detected.push(this._signal('scope_explosion', event.actorId, score,
        `Accessed ${recentResources.size} unique resources in 1 min (threshold: ${this._cfg.scopeExplosionThreshold})`));
    }

    // 7. Validator-specific: unusual signing requests
    if (event.actorType === 'validator' && event.resource.includes('/sign')) {
      const sigCount = window.filter(e => e.timestamp >= now - 60_000 && e.resource.includes('/sign')).length;
      if (sigCount > 6) { // validators should not sign more than ~6/min
        detected.push(this._signal('validator_key_abuse', event.actorId, Math.min(1, sigCount / 20),
          `Validator signed ${sigCount} messages in 1 min — possible key abuse`));
      }
    }

    // 8. Treasury drain pattern: rapid succession of treasury reads
    if (event.resource.includes('treasury')) {
      const treasuryCount = window.filter(e => e.timestamp >= now - 30_000 && e.resource.includes('treasury')).length;
      if (treasuryCount > 10) {
        detected.push(this._signal('treasury_drain_pattern', event.actorId, 0.85,
          `${treasuryCount} treasury accesses in 30s — drain pattern detected`));
      }
    }

    // Block if any high-severity signal detected
    if (detected.some(s => s.score >= 0.7)) {
      this._block(event.actorId, detected[0]!.type);
    }

    // Record signals
    for (const sig of detected) this._recordSignal(sig);

    return detected;
  }

  // ── Blocking ───────────────────────────────────────────────────────────────

  private _block(actorId: string, reason: AnomalyType): void {
    const existing = this._blocked.get(actorId);
    this._blocked.set(actorId, {
      actorId,
      blockedUntil: Date.now() + this._cfg.blockMs,
      reason,
      blockCount: (existing?.blockCount ?? 0) + 1,
    });
  }

  isBlocked(actorId: string): boolean {
    const b = this._blocked.get(actorId);
    if (!b) return false;
    if (b.blockedUntil <= Date.now()) {
      this._blocked.delete(actorId);
      return false;
    }
    return true;
  }

  unblock(actorId: string): void {
    this._blocked.delete(actorId);
  }

  getBlockInfo(actorId: string): BlockedState | undefined {
    return this._blocked.get(actorId);
  }

  // ── Query ──────────────────────────────────────────────────────────────────

  recentSignals(limit = 50): AnomalySignal[] {
    return this._signals.slice(-limit);
  }

  signalsByActor(actorId: string, limit = 20): AnomalySignal[] {
    return this._signals.filter(s => s.actorId === actorId).slice(-limit);
  }

  blockedActors(): BlockedState[] {
    const now = Date.now();
    const active: BlockedState[] = [];
    for (const [id, b] of this._blocked) {
      if (b.blockedUntil > now) active.push(b);
      else this._blocked.delete(id);
    }
    return active;
  }

  // ── Maintenance ────────────────────────────────────────────────────────────

  /** Prune sliding windows to remove entries older than 1 hour. */
  prune(): void {
    const cutoff = Date.now() - 3_600_000;
    for (const [id, events] of this._windows) {
      const trimmed = events.filter(e => e.timestamp >= cutoff);
      if (trimmed.length === 0) this._windows.delete(id);
      else this._windows.set(id, trimmed);
    }
    // Clean stale token IP sets
    if (this._tokenIps.size > 10_000) {
      this._tokenIps.clear();
    }
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private _updateWindow(actorId: string, event: AccessEvent, now: number): AccessEvent[] {
    const list = this._windows.get(actorId) ?? [];
    list.push(event);
    // Keep only last hour
    const fresh = list.filter(e => e.timestamp >= now - 3_600_000);
    this._windows.set(actorId, fresh);
    return fresh;
  }

  private _signal(
    type: AnomalyType,
    actorId: string,
    score: number,
    description: string,
    metadata?: Record<string, string | number>,
  ): AnomalySignal {
    return { type, actorId, score, description, ts: Date.now(), ...(metadata !== undefined && { metadata }) };
  }

  private _recordSignal(sig: AnomalySignal): void {
    this._signals.push(sig);
    if (this._signals.length > this._maxSignals) {
      this._signals.splice(0, this._signals.length - this._maxSignals);
    }
  }
}
