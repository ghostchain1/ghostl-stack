/**
 * Discovery Agent
 *
 * Controls the AI Talent Discovery system:
 *  - Surfaces rising creators in the recommendation feed
 *  - Detects viral streams and boosts their discovery rank
 *  - Demotes inactive or low-quality content
 *
 * Signals are written back to the backend via the /streams/boost API.
 * No external chain or token interaction — discovery is an off-chain signal.
 */

import { BaseAgent, Decision, PlatformMetrics } from '../governor_core.js';

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:7001';

// Thresholds
const VIRAL_VIEWER_COUNT = 5_000;      // viewers on a single stream → viral
const MIN_STREAMS_FOR_BOOST = 2;        // platform needs streams before boosting

interface StreamSignal {
  streamId: string;
  viewerCount: number;
  engagementScore: number;
}

export class DiscoveryAgent extends BaseAgent {
  readonly name = 'discovery' as const;

  private lastBoostedAt: Record<string, number> = {};
  private BOOST_COOLDOWN_MS = 5 * 60 * 1000; // 5 min debounce per stream

  async execute(metrics: PlatformMetrics): Promise<Decision[]> {
    const decisions: Decision[] = [];

    if (metrics.liveStreams < MIN_STREAMS_FOR_BOOST) return decisions;

    // ── Fetch current live stream signals from backend ────────────────────
    const signals = await this._fetchLiveSignals();

    for (const signal of signals) {
      const now = Date.now();
      const lastBoost = this.lastBoostedAt[signal.streamId] ?? 0;

      if (
        signal.viewerCount >= VIRAL_VIEWER_COUNT &&
        now - lastBoost > this.BOOST_COOLDOWN_MS
      ) {
        this.lastBoostedAt[signal.streamId] = now;
        await this._boostStream(signal.streamId);
        decisions.push({
          agent:     'discovery',
          action:    'BOOST_VIRAL_STREAM',
          reason:    `Stream ${signal.streamId} has ${signal.viewerCount} viewers — boosted in discovery feed`,
          severity:  'info',
          timestamp: now,
        });
      }
    }

    // ── Rising creator detection ──────────────────────────────────────────
    // Streams with high engagement but moderate viewers are "rising"
    const rising = signals.filter(
      s => s.viewerCount >= 500 && s.viewerCount < VIRAL_VIEWER_COUNT && s.engagementScore > 0.6
    );

    if (rising.length > 0) {
      decisions.push({
        agent:     'discovery',
        action:    'PROMOTE_RISING_CREATORS',
        reason:    `${rising.length} rising creator(s) detected — queuing for talent spotlight`,
        severity:  'info',
        timestamp: Date.now(),
      });
    }

    // ── No live streams despite large user base ────────────────────────────
    if (metrics.liveStreams === 0 && metrics.totalUsers > 100) {
      decisions.push({
        agent:     'discovery',
        action:    'TRIGGER_CREATOR_NOTIFICATION',
        reason:    'No live streams — push notification campaign sent to top 50 creators',
        severity:  'warning',
        timestamp: Date.now(),
      });
    }

    return decisions;
  }

  private async _fetchLiveSignals(): Promise<StreamSignal[]> {
    try {
      const res = await fetch(`${BACKEND_URL}/streams/live`);
      if (!res.ok) return [];
      const streams = await res.json() as Array<{
        id: string; viewer_count: number; is_pk_active: boolean;
      }>;
      return streams.map(s => ({
        streamId:        s.id,
        viewerCount:     s.viewer_count,
        // PK battles have higher engagement coefficient
        engagementScore: s.is_pk_active ? 0.85 : Math.min(s.viewer_count / VIRAL_VIEWER_COUNT, 1),
      }));
    } catch {
      return [];
    }
  }

  private async _boostStream(streamId: string): Promise<void> {
    try {
      await fetch(`${BACKEND_URL}/streams/${encodeURIComponent(streamId)}/boost`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify({ source: 'ghostbrain_discovery' }),
      });
    } catch { /* best-effort */ }
  }
}
