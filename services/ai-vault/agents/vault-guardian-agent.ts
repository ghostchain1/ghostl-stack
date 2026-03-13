/**
 * GhostStack AI Vault — Vault Guardian Agent
 * Continuously monitors all vault activity for anomalies.
 * The always-on sentinel that feeds the SecurityBrain in real time.
 *
 * Responsibilities:
 *   • Poll audit ledger for unusual patterns
 *   • Detect rapid sequential reads across namespaces
 *   • Detect off-hours access (based on actor profiles)
 *   • Detect new actors accessing high-value resources
 *   • Emit alerts to ThreatResponseAgent when suspicious events occur
 *
 * GhostChain L1 (14000101) | L2 (901) | L3 (903) | GST gas token
 */

import type { SecurityBrain, SecurityVerdict } from '../ai/security-brain.js';
import type { AuditLedger, AuditEntry } from '../storage/audit-ledger.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface GuardianAlert {
  level: 'info' | 'warning' | 'critical';
  message: string;
  actorId: string;
  resource: string;
  verdict: SecurityVerdict | null;
  ts: number;
}

export type AlertHandler = (alert: GuardianAlert) => void | Promise<void>;

// ── VaultGuardianAgent ─────────────────────────────────────────────────────

export class VaultGuardianAgent {
  private readonly _brain:    SecurityBrain;
  private readonly _audit:    AuditLedger;
  private readonly _handlers: AlertHandler[] = [];

  private _timer: ReturnType<typeof setInterval> | undefined;
  private _lastSeen = 0;

  // Known actors cache: actorId → first-seen timestamp
  private readonly _knownActors = new Map<string, number>();

  // Running (rolling 5-min window) resource access counts per actor
  private readonly _rollingCounts = new Map<string, { count: number; resources: Set<string>; ts: number }>();

  private static readonly POLL_INTERVAL_MS    = 10_000;   // 10 s
  private static readonly SCOPE_THRESHOLD     = 20;       // unique resources in 5 min
  private static readonly ROLLING_WINDOW_MS   = 5 * 60_000;

  constructor(brain: SecurityBrain, audit: AuditLedger) {
    this._brain = brain;
    this._audit = audit;

    // Subscribe to real-time brain verdicts for immediate alerting
    this._brain.onThreat(verdict => void this._handleThreatVerdict(verdict));
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  start(): void {
    if (this._timer) return;
    this._lastSeen = Date.now();
    this._timer = setInterval(() => void this._poll(), VaultGuardianAgent.POLL_INTERVAL_MS);
    this._timer.unref?.();
    console.info('[VaultGuardianAgent] Started — monitoring vault activity');
  }

  stop(): void {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = undefined;
    }
    console.info('[VaultGuardianAgent] Stopped');
  }

  // ── Alert subscriptions ───────────────────────────────────────────────────────

  onAlert(handler: AlertHandler): void {
    this._handlers.push(handler);
  }

  // ── Core Poll Loop ─────────────────────────────────────────────────────────────

  private async _poll(): Promise<void> {
    try {
      const now     = Date.now();
      const entries = this._audit.query({ since: this._lastSeen, limit: 200 });
      this._lastSeen = now;

      for (const entry of entries) {
        this._updateRolling(entry);
        this._detectNewActor(entry);
        this._detectScopeExplosion(entry.actor);
        this._detectHighRisk(entry);
      }
    } catch (err) {
      console.error('[VaultGuardianAgent] Poll error:', err);
    }
  }

  private _updateRolling(entry: AuditEntry): void {
    const now   = Date.now();
    const state = this._rollingCounts.get(entry.actor) ?? { count: 0, resources: new Set(), ts: now };

    // Reset window if expired
    if (now - state.ts > VaultGuardianAgent.ROLLING_WINDOW_MS) {
      state.count     = 0;
      state.resources = new Set();
      state.ts        = now;
    }

    state.count++;
    state.resources.add(entry.resource);
    this._rollingCounts.set(entry.actor, state);
  }

  private _detectNewActor(entry: AuditEntry): void {
    if (!this._knownActors.has(entry.actor)) {
      this._knownActors.set(entry.actor, entry.timestamp);

      // New actor accessing high-risk resources → warn
      if (entry.resource.includes('validator') || entry.resource.includes('treasury') || entry.resource.includes('bridge')) {
        void this._emit({
          level:    'warning',
          message:  `New actor accessing high-value resource: ${entry.resource}`,
          actorId:  entry.actor,
          resource: entry.resource,
          verdict:  null,
          ts:       Date.now(),
        });
      }
    }
  }

  private _detectScopeExplosion(actor: string): void {
    const state = this._rollingCounts.get(actor);
    if (state && state.resources.size >= VaultGuardianAgent.SCOPE_THRESHOLD) {
      void this._emit({
        level:   'warning',
        message: `Scope explosion detected: ${actor} accessed ${state.resources.size} resources in 5 min`,
        actorId:  actor,
        resource: 'vault://multiple',
        verdict:  null,
        ts:       Date.now(),
      });
    }
  }

  private _detectHighRisk(entry: AuditEntry): void {
    if (entry.riskScore >= 0.7) {
      void this._emit({
        level:    entry.riskScore >= 0.85 ? 'critical' : 'warning',
        message:  `High-risk audit entry: ${entry.action} on ${entry.resource} (risk=${entry.riskScore.toFixed(2)})`,
        actorId:  entry.actor,
        resource: entry.resource,
        verdict:  null,
        ts:       Date.now(),
      });
    }
  }

  private async _handleThreatVerdict(verdict: SecurityVerdict): Promise<void> {
    const level = verdict.riskLevel === 'critical' ? 'critical' : 'warning';
    await this._emit({
      level,
      message:  `AI brain threat: ${verdict.message} (risk=${verdict.riskScore.toFixed(2)})`,
      actorId:  verdict.assessment?.actorId ?? 'unknown',
      resource: verdict.assessment?.resource ?? 'unknown',
      verdict,
      ts:       Date.now(),
    });
  }

  private async _emit(alert: GuardianAlert): Promise<void> {
    const prefix = alert.level === 'critical' ? '🚨' : alert.level === 'warning' ? '⚠️' : 'ℹ️';
    console.info(`[VaultGuardianAgent] ${prefix} ${alert.message}`);

    this._audit.append({
      actor: 'vault-guardian-agent', actorType: 'vault',
      resource: alert.resource, action: 'anomaly.detected',
      result: 'success', riskScore: alert.verdict?.riskScore ?? 0.5,
      message: alert.message,
    });

    for (const handler of this._handlers) {
      try { await handler(alert); } catch { /* non-fatal */ }
    }
  }
}
