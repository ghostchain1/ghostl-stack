/**
 * Event Agent
 *
 * Manages global platform events:
 *  - Starts scheduled tournaments when platform load is high
 *  - Monitors PK battle engagement
 *  - Dynamically adjusts prize pools based on engagement metrics
 *  - Closes stale / low-engagement events and refunds pools
 *
 * Prize pool mutations are proposed as governance suggestions to the
 * signing relay at http://localhost:7910 — never executed inline.
 */

import { BaseAgent, Decision, PlatformMetrics } from '../governor_core.js';

const BACKEND_URL    = process.env.BACKEND_URL    ?? 'http://localhost:7001';
const SIGNING_RELAY  = process.env.SIGNING_RELAY  ?? 'http://localhost:7910';

// Thresholds
const LOW_ENGAGEMENT_THRESHOLD   = 0.2;    // < 20% of expected viewers
const HIGH_ENGAGEMENT_THRESHOLD  = 0.8;    // > 80% of expected viewers
const STALE_EVENT_AGE_MS         = 2 * 60 * 60 * 1000;  // 2 hours

interface ActiveEvent {
  id:          string;
  title:       string;
  prizePool:   number;           // GST
  participants: number;
  createdAt:   number;           // timestamp
  expectedViewers: number;
}

export class EventAgent extends BaseAgent {
  readonly name = 'event' as const;

  private managedEvents = new Map<string, ActiveEvent>();

  async execute(metrics: PlatformMetrics): Promise<Decision[]> {
    const decisions: Decision[] = [];

    // ── Sync active events from backend ───────────────────────────────────
    await this._syncEvents();

    const now = Date.now();

    for (const [id, event] of this.managedEvents) {
      const engagementRatio =
        event.expectedViewers > 0
          ? Math.min(metrics.liveStreams / event.expectedViewers, 1)
          : 0;

      // Stale event cleanup
      if (now - event.createdAt > STALE_EVENT_AGE_MS && event.participants < 2) {
        decisions.push({
          agent:     'event',
          action:    'CLOSE_STALE_EVENT',
          reason:    `Event "${event.title}" (${id}) stale for >2h with <2 participants — closing and refunding pool`,
          severity:  'warning',
          timestamp: now,
        });
        await this._proposeEventClose(id);
        this.managedEvents.delete(id);
        continue;
      }

      // Low engagement → increase prize pool to attract participants
      if (engagementRatio < LOW_ENGAGEMENT_THRESHOLD) {
        const bonusGst = Math.round(event.prizePool * 0.2);
        decisions.push({
          agent:     'event',
          action:    'INCREASE_EVENT_PRIZE',
          reason:    `Event "${event.title}" engagement ${(engagementRatio * 100).toFixed(0)}% — proposing +${bonusGst} GST bonus pool`,
          severity:  'warning',
          timestamp: now,
        });
        await this._proposePrizeBoost(id, bonusGst);
      }

      // High engagement → log success
      if (engagementRatio > HIGH_ENGAGEMENT_THRESHOLD) {
        decisions.push({
          agent:     'event',
          action:    'EVENT_PERFORMING_WELL',
          reason:    `Event "${event.title}" at ${(engagementRatio * 100).toFixed(0)}% engagement — no action needed`,
          severity:  'info',
          timestamp: now,
        });
      }
    }

    // ── Auto-start tournaments when platform is busy ───────────────────────
    if (metrics.liveStreams >= 10 && metrics.activeEvents === 0) {
      decisions.push({
        agent:     'event',
        action:    'SUGGEST_AUTO_TOURNAMENT',
        reason:    `${metrics.liveStreams} live streams active with no events — suggesting platform-wide PK tournament`,
        severity:  'info',
        timestamp: now,
      });
    }

    return decisions;
  }

  private async _syncEvents(): Promise<void> {
    try {
      const res = await fetch(`${BACKEND_URL}/events/active`);
      if (!res.ok) return;
      const events = await res.json() as Array<{
        id: string; title: string; prize_pool: number;
        participants: number; created_at: string;
      }>;
      for (const e of events) {
        if (!this.managedEvents.has(e.id)) {
          this.managedEvents.set(e.id, {
            id:              e.id,
            title:           e.title,
            prizePool:       e.prize_pool,
            participants:    e.participants,
            createdAt:       new Date(e.created_at).getTime(),
            expectedViewers: Math.max(e.participants * 100, 500),
          });
        }
      }
    } catch { /* best-effort */ }
  }

  private async _proposePrizeBoost(eventId: string, bonusGst: number): Promise<void> {
    try {
      await fetch(`${SIGNING_RELAY}/propose`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type:    'EVENT_PRIZE_BOOST',
          eventId, bonusGst,
          chainId: 903,
          source:  'ghostbrain_event_agent',
        }),
      });
    } catch { /* governance relay may be offline */ }
  }

  private async _proposeEventClose(eventId: string): Promise<void> {
    try {
      await fetch(`${SIGNING_RELAY}/propose`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type:    'EVENT_CLOSE',
          eventId, chainId: 903,
          source:  'ghostbrain_event_agent',
        }),
      });
    } catch { /* governance relay may be offline */ }
  }
}
