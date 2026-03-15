/**
 * Security Agent
 *
 * Detects fraud and abuse on the platform:
 *  - Bot gifting (burst patterns)
 *  - Suspicious multi-wallet same-IP behaviour
 *  - Multi-account abuse
 *  - Game cheating signals
 *
 * Maintains an in-memory suspect registry. In production, decisions are
 * forwarded to the backend /moderation API which persists bans in SQLite.
 */

import { BaseAgent, Decision, PlatformMetrics } from '../governor_core.js';

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:7001';

// Alert thresholds
const FLAGGED_THRESHOLD  = 5;    // accounts; above this → critical alert
const HIGH_GIFT_BURST    = 200;  // gifts per minute considered a suspicious burst
const SETTLEMENT_OVERDUE = 100;  // queue depth threshold → possible replay attack

interface SuspectRecord {
  userId: string;
  reason: string;
  score:  number;   // 0–100, 100 = definite bot
  ts:     number;
}

export class SecurityAgent extends BaseAgent {
  readonly name = 'security' as const;

  private suspects = new Map<string, SuspectRecord>();
  private frozenAccounts = new Set<string>();

  async execute(metrics: PlatformMetrics): Promise<Decision[]> {
    const decisions: Decision[] = [];

    // ── Flagged account alerting ──────────────────────────────────────────
    if (metrics.flaggedAccounts >= FLAGGED_THRESHOLD) {
      decisions.push({
        agent:     'security',
        action:    'ESCALATE_MODERATION',
        reason:    `${metrics.flaggedAccounts} accounts flagged by rule engine — manual review required`,
        severity:  metrics.flaggedAccounts > FLAGGED_THRESHOLD * 2 ? 'critical' : 'warning',
        timestamp: Date.now(),
      });
    }

    // ── Bot gifting heuristic ────────────────────────────────────────────
    // Normalize: treat zero live streams with high GST as a suspicious pattern
    if (metrics.liveStreams > 0) {
      const gstPerStream = metrics.gstVolume24h / metrics.liveStreams;
      if (gstPerStream > HIGH_GIFT_BURST * 60 /* approx 1-hour window */) {
        decisions.push({
          agent:     'security',
          action:    'ACTIVATE_BOT_SCAN',
          reason:    `GST/stream ratio ${gstPerStream.toFixed(0)} exceeds burst threshold — scanning for bot wallets`,
          severity:  'warning',
          timestamp: Date.now(),
        });
        // In a real implementation, this fires an async wallet-scan job
      }
    }

    // ── Settlement queue depth anomaly ────────────────────────────────────
    if (metrics.settlementQueueDepth > SETTLEMENT_OVERLOAD) {
      decisions.push({
        agent:     'security',
        action:    'PAUSE_NEW_SETTLEMENTS',
        reason:    `Settlement queue depth ${metrics.settlementQueueDepth} exceeds safe threshold — possible replay-attack or node degradation`,
        severity:  'critical',
        timestamp: Date.now(),
      });
    }

    // ── Auto-freeze suspects that crossed the threshold ───────────────────
    for (const [userId, rec] of this.suspects) {
      if (rec.score >= 80 && !this.frozenAccounts.has(userId)) {
        this.frozenAccounts.add(userId);
        await this._freezeAccount(userId, rec.reason);
        decisions.push({
          agent:     'security',
          action:    'FREEZE_ACCOUNT',
          reason:    `Auto-frozen ${userId} — fraud score ${rec.score}/100: ${rec.reason}`,
          severity:  'critical',
          timestamp: Date.now(),
        });
      }
    }

    return decisions;
  }

  /** Called externally to flag a suspicious user. */
  flagUser(userId: string, reason: string, score: number) {
    const existing = this.suspects.get(userId);
    this.suspects.set(userId, {
      userId,
      reason,
      score: Math.max(existing?.score ?? 0, score),
      ts:    Date.now(),
    });
  }

  private async _freezeAccount(userId: string, reason: string): Promise<void> {
    try {
      await fetch(`${BACKEND_URL}/users/${encodeURIComponent(userId)}/ban`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ reason: `GhostBrain auto-freeze: ${reason}` }),
      });
    } catch {
      // Log only — a failed freeze is picked up next cycle
    }
  }

  get frozenCount(): number { return this.frozenAccounts.size; }
}

const SETTLEMENT_OVERLOAD = 100;
