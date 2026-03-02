/**
 * agents/risk-governor.ts — Independent risk veto agent.
 *
 * Acts as a dedicated "no" vote. Its only job is to independently verify
 * that the current market conditions and on-chain state would pass all
 * RiskEngine invariants *before* any proposal is submitted.
 *
 * A single high-confidence rejection from this agent blocks the proposal.
 */

import { BaseAgent } from './base.js';
import type { AgentContext, AgentVote } from './types.js';
import { ethers } from 'ethers';

/** If daily VaR is above this fraction of limit, reject. */
const VAR_CAUTION_FRACTION = 0.7;

/** If weekly loss is above this fraction of limit, reject. */
const WEEKLY_LOSS_CAUTION_FRACTION = 0.6;

/** Minimum stable reserve in ETH before any proposal is approved. */
const MIN_STABLE_ETH = 1_000n;

export class RiskGovernor extends BaseAgent {
  readonly id = 'risk-governor';
  readonly description = 'Independent risk veto — stress tests and tail-risk analysis';

  protected async reason(ctx: AgentContext): Promise<AgentVote> {
    const { snapshot } = ctx;
    const reasons: string[] = [];
    let maxSeverity = 0;

    // ── Circuit breaker ────────────────────────────────────────────────────
    if (snapshot.circuitBreakerOpen) {
      return {
        agentId:    this.id,
        verdict:    'reject',
        confidence: 1.0,
        rationale:  'HARD STOP: on-chain circuit breaker is open.',
      };
    }

    // ── Stable reserve below floor ─────────────────────────────────────────
    if (snapshot.stableReserveEth < MIN_STABLE_ETH) {
      reasons.push(`Stable reserve ${ethers.formatEther(snapshot.stableReserveEth)} ETH < ${ethers.formatEther(MIN_STABLE_ETH)} ETH floor`);
      maxSeverity = Math.max(maxSeverity, 0.9);
    }

    // ── Daily VaR over caution threshold ───────────────────────────────────
    // We don't have the on-chain limit here; compare relative to snapshot
    // dailyVaR (which the market-data-ingestor fills in from RiskEngine).
    // If dailyVaR is already at 70%+ of the configured limit, caution.
    // (Exact limit fetched by snapshot collector; proxy: if dailyVar > navEth * 5%)
    const navFivePercent = snapshot.navEth * 5n / 100n;
    if (snapshot.dailyVaREth > navFivePercent) {
      const pct = Math.round(
        Number((snapshot.dailyVaREth * 100n) / (snapshot.navEth || 1n)),
      );
      reasons.push(`Daily VaR ${pct}% of NAV exceeds 5% caution threshold`);
      maxSeverity = Math.max(maxSeverity, 0.8 * VAR_CAUTION_FRACTION);
    }

    // ── Weekly loss over caution threshold ─────────────────────────────────
    const navTenPercent = snapshot.navEth * 10n / 100n;
    if (snapshot.weeklyLossEth > navTenPercent) {
      const pct = Math.round(
        Number((snapshot.weeklyLossEth * 100n) / (snapshot.navEth || 1n)),
      );
      reasons.push(`Weekly loss ${pct}% of NAV exceeds 10% caution threshold`);
      maxSeverity = Math.max(maxSeverity, 0.85 * WEEKLY_LOSS_CAUTION_FRACTION);
    }

    if (reasons.length > 0) {
      return {
        agentId:    this.id,
        verdict:    'reject',
        confidence: maxSeverity,
        rationale:  `Risk gate failures:\n${reasons.map(r => `  • ${r}`).join('\n')}`,
        evidence: {
          navEth:        snapshot.navEth.toString(),
          stableEth:     snapshot.stableReserveEth.toString(),
          dailyVarEth:   snapshot.dailyVaREth.toString(),
          weeklyLossEth: snapshot.weeklyLossEth.toString(),
        },
      };
    }

    return {
      agentId:    this.id,
      verdict:    'approve',
      confidence: 0.9,
      rationale:  'All risk gates green. Daily VaR and weekly loss within limits.',
    };
  }
}
