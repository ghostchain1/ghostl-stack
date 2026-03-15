/**
 * Treasury Agent
 *
 * Optimizes the on-chain creator treasury (GhostL3 CreatorTreasury.sol):
 *  - Analyses creator staking participation rates
 *  - Proposes bonus staking rewards when participation is low
 *  - Monitors treasury growth trends
 *  - Flags creators with stalled earnings for incentive campaigns
 *
 * All treasury mutations are submitted as governance proposals to the
 * signing relay — never executed directly.
 */

import { BaseAgent, Decision, PlatformMetrics } from '../governor_core.js';

const BACKEND_URL  = process.env.BACKEND_URL  ?? 'http://localhost:7001';
const SIGNING_RELAY = process.env.SIGNING_RELAY ?? 'http://localhost:7910';

// Thresholds
const LOW_STAKING_RATE   = 0.2;    // < 20% of eligible creators staking
const HIGH_STAKING_RATE  = 0.7;    // > 70% of eligible creators staking
const STALE_EARNINGS_GST = 100;    // GST unclaimed for too long → nudge

interface CreatorTreasurySummary {
  creatorId:       string;
  pendingEarnings: number;    // GST
  stakedBalance:   number;    // GST
  lastClaimAt:     string;
}

export class TreasuryAgent extends BaseAgent {
  readonly name = 'treasury' as const;

  private bonusActive = false;

  async execute(metrics: PlatformMetrics): Promise<Decision[]> {
    const decisions: Decision[] = [];

    // ── Fetch treasury summaries from backend ─────────────────────────────
    const summaries = await this._fetchTreasurySummaries();

    if (summaries.length === 0) return decisions;

    const stakingCreators = summaries.filter(c => c.stakedBalance > 0).length;
    const stakingRate     = stakingCreators / summaries.length;

    // ── Staking participation ──────────────────────────────────────────────
    if (stakingRate < LOW_STAKING_RATE && !this.bonusActive) {
      this.bonusActive = true;
      await this._proposeBonusStaking();
      decisions.push({
        agent:     'treasury',
        action:    'ACTIVATE_STAKING_BONUS',
        reason:    `Only ${(stakingRate * 100).toFixed(0)}% of creators staking — proposing 1.5x staking reward campaign on GhostL3`,
        severity:  'warning',
        timestamp: Date.now(),
      });
    } else if (stakingRate >= HIGH_STAKING_RATE && this.bonusActive) {
      this.bonusActive = false;
      decisions.push({
        agent:     'treasury',
        action:    'DEACTIVATE_STAKING_BONUS',
        reason:    `Staking rate recovered to ${(stakingRate * 100).toFixed(0)}% — bonus campaign concluded`,
        severity:  'info',
        timestamp: Date.now(),
      });
    }

    // ── Stale earnings nudge ──────────────────────────────────────────────
    const stale = summaries.filter(c => c.pendingEarnings >= STALE_EARNINGS_GST);
    if (stale.length > 0) {
      decisions.push({
        agent:     'treasury',
        action:    'NUDGE_PAYOUT_CLAIM',
        reason:    `${stale.length} creator(s) have ≥${STALE_EARNINGS_GST} GST unclaimed — push notification queued`,
        severity:  'info',
        timestamp: Date.now(),
      });
    }

    // ── Pending payouts flush (mirror to economy agent) ───────────────────
    if (metrics.pendingPayouts > 100) {
      decisions.push({
        agent:     'treasury',
        action:    'EMERGENCY_PAYOUT_FLUSH',
        reason:    `${metrics.pendingPayouts} pending payouts — proposing emergency GhostL3 batch release`,
        severity:  'critical',
        timestamp: Date.now(),
      });
      await this._proposePayoutFlush();
    }

    return decisions;
  }

  private async _fetchTreasurySummaries(): Promise<CreatorTreasurySummary[]> {
    try {
      const res = await fetch(`${BACKEND_URL}/admin/treasury/summary`);
      if (!res.ok) return [];
      return await res.json() as CreatorTreasurySummary[];
    } catch {
      return [];
    }
  }

  private async _proposeBonusStaking(): Promise<void> {
    try {
      await fetch(`${SIGNING_RELAY}/propose`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type:       'STAKING_BONUS_CAMPAIGN',
          multiplier: 1.5,
          chainId:    903,
          source:     'ghostbrain_treasury_agent',
        }),
      });
    } catch { /* signing relay may be offline */ }
  }

  private async _proposePayoutFlush(): Promise<void> {
    try {
      await fetch(`${SIGNING_RELAY}/propose`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type:    'EMERGENCY_PAYOUT_FLUSH',
          chainId: 903,
          source:  'ghostbrain_treasury_agent',
        }),
      });
    } catch { /* signing relay may be offline */ }
  }
}
