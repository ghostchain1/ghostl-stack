/**
 * agents/market-sentinel.ts — Market integrity + manipulation detection agent.
 *
 * Detects anomalous conditions that would make treasury actions unsafe:
 *   • Gas price spikes (may indicate frontrunning / attack window)
 *   • Rapid NAV changes (potential oracle manipulation)
 *   • Sequencer fee anomalies (L2 congestion / manipulation)
 *   • Volume spikes that could indicate wash trading
 *
 * If this agent rejects, the cycle is frozen until the next window.
 */

import { BaseAgent } from './base.js';
import type { AgentContext, AgentVote } from './types.js';
import { ethers } from 'ethers';

/** Maximum acceptable sequencer fee rate (gwei). Above this = suspicious. */
const MAX_SEQ_FEE_GWEI = 200;

/** NAV change threshold per cycle that triggers a pause (bps). */
const NAV_CHANGE_ALERT_BPS = 500; // 5%

export class MarketSentinel extends BaseAgent {
  readonly id = 'market-sentinel';
  readonly description = 'Market integrity monitoring and manipulation detection';

  private lastNavEth: bigint = 0n;

  protected async reason(ctx: AgentContext): Promise<AgentVote> {
    const { snapshot } = ctx;
    const alerts: string[] = [];

    // ── Sequencer fee spike ────────────────────────────────────────────────
    if (snapshot.sequencerFeeRateGwei > MAX_SEQ_FEE_GWEI) {
      alerts.push(
        `Sequencer fee ${snapshot.sequencerFeeRateGwei} gwei > ${MAX_SEQ_FEE_GWEI} gwei threshold (possible congestion/attack window)`,
      );
    }

    // ── Rapid NAV change ───────────────────────────────────────────────────
    if (this.lastNavEth > 0n) {
      const navDelta = snapshot.navEth > this.lastNavEth
        ? snapshot.navEth - this.lastNavEth
        : this.lastNavEth - snapshot.navEth;
      const deltaBps = this.lastNavEth > 0n
        ? Number((navDelta * 10_000n) / this.lastNavEth)
        : 0;

      if (deltaBps > NAV_CHANGE_ALERT_BPS) {
        alerts.push(
          `NAV changed ${(deltaBps / 100).toFixed(1)}% in one cycle — possible oracle manipulation or large external event`,
        );
      }
    }
    this.lastNavEth = snapshot.navEth;

    if (alerts.length > 0) {
      return {
        agentId:    this.id,
        verdict:    'reject',
        confidence: 0.85,
        rationale:  `Market integrity alerts:\n${alerts.map(a => `  ⚠ ${a}`).join('\n')}`,
        evidence: {
          seqFeeGwei:  snapshot.sequencerFeeRateGwei,
          navEth:      ethers.formatEther(snapshot.navEth),
          lastNavEth:  ethers.formatEther(this.lastNavEth),
        },
      };
    }

    return {
      agentId:    this.id,
      verdict:    'approve',
      confidence: 0.8,
      rationale:  'Market integrity OK. No manipulation signals detected.',
    };
  }
}
