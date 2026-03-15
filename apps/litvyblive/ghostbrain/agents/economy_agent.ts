/**
 * Economy Agent
 *
 * Manages platform economics:
 *  - Gift price pressure & reward-pool adjustments
 *  - Creator incentive multipliers
 *  - GST flow health monitoring
 *
 * All adjustments target GhostL3 (chain_id=903) GST token flows only.
 */

import { BaseAgent, Decision, PlatformMetrics } from '../governor_core.js';

// Thresholds
const HIGH_GST_VOLUME   = 100_000;   // GST-units in 24 h — economy is booming
const LOW_GST_VOLUME    = 1_000;     // GST-units in 24 h — economy is stalling
const MAX_MULTIPLIER    = 3.0;
const MIN_MULTIPLIER    = 0.5;
const MULTIPLIER_STEP   = 0.1;

export class EconomyAgent extends BaseAgent {
  readonly name = 'economy' as const;

  /** Current reward multiplier — shared with the treasury. */
  private multiplier = 1.0;

  async execute(metrics: PlatformMetrics): Promise<Decision[]> {
    const decisions: Decision[] = [];

    // ── GST volume health check ──────────────────────────────────────────
    if (metrics.gstVolume24h > HIGH_GST_VOLUME) {
      // Economy is hot — slightly reduce multiplier to prevent inflation
      if (this.multiplier > MIN_MULTIPLIER) {
        this.multiplier = Math.max(MIN_MULTIPLIER, +(this.multiplier - MULTIPLIER_STEP).toFixed(2));
        decisions.push({
          agent: 'economy',
          action: 'REDUCE_REWARD_MULTIPLIER',
          reason: `24h GST volume ${metrics.gstVolume24h.toFixed(0)} exceeds ${HIGH_GST_VOLUME} — easing rewards to ${this.multiplier}x`,
          severity: 'info',
          timestamp: Date.now(),
        });
      }
    } else if (metrics.gstVolume24h < LOW_GST_VOLUME) {
      // Economy is cold — raise multiplier to stimulate gifting
      if (this.multiplier < MAX_MULTIPLIER) {
        this.multiplier = Math.min(MAX_MULTIPLIER, +(this.multiplier + MULTIPLIER_STEP).toFixed(2));
        decisions.push({
          agent: 'economy',
          action: 'INCREASE_REWARD_MULTIPLIER',
          reason: `24h GST volume ${metrics.gstVolume24h.toFixed(0)} below ${LOW_GST_VOLUME} — boosting rewards to ${this.multiplier}x`,
          severity: 'warning',
          timestamp: Date.now(),
        });
      }
    }

    // ── Creator incentives ────────────────────────────────────────────────
    if (metrics.liveStreams === 0 && metrics.totalUsers > 50) {
      decisions.push({
        agent: 'economy',
        action: 'TRIGGER_CREATOR_BONUS',
        reason: 'No active streams detected — issuing 2x GST bonus for first stream start',
        severity: 'warning',
        timestamp: Date.now(),
      });
    }

    // ── Pending payouts alert ──────────────────────────────────────────────
    if (metrics.pendingPayouts > 50) {
      decisions.push({
        agent: 'economy',
        action: 'FLUSH_PAYOUT_QUEUE',
        reason: `${metrics.pendingPayouts} pending creator payouts — triggering batch settlement on GhostL3`,
        severity: 'warning',
        timestamp: Date.now(),
      });
    }

    return decisions;
  }

  /** Expose current multiplier for other agents or dashboard reads. */
  getMultiplier(): number { return this.multiplier; }
}
