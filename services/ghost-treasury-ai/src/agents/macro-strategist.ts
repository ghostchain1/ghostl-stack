/**
 * agents/macro-strategist.ts — Long-horizon capital allocation agent.
 *
 * Analyses treasury NAV trajectory, ops runway, and strategy performance
 * to recommend rebalancing towards or away from specific strategy buckets.
 *
 * Focus: internal protocol-native revenue only:
 *   • L1 base fees (GST gas)
 *   • L2/L3 sequencer fees routed to L1
 *   • Bridge fees (L2↔L1, L3↔L2)
 *   • Validator staking yields
 *   • Buyback/burn programs
 */

import { BaseAgent } from './base.js';
import type { AgentContext, AgentVote } from './types.js';
import { ethers } from 'ethers';

/** Minimum 6-month runway in ETH required before any rebalance is recommended. */
const RUNWAY_FLOOR_ETH = 1_000n;

/** Target stable reserve as a fraction of NAV (18%) */
const TARGET_STABLE_FRACTION_BPS = 1_800n;

export class MacroStrategist extends BaseAgent {
  readonly id = 'macro-strategist';
  readonly description = 'Long-horizon capital allocation and strategy selection';

  protected async reason(ctx: AgentContext): Promise<AgentVote> {
    const { snapshot } = ctx;
    const nav      = snapshot.navEth;
    const stable   = snapshot.stableReserveEth;
    const dailyVar = snapshot.dailyVaREth;

    // Hard gate: never recommend if circuit breaker is open
    if (snapshot.circuitBreakerOpen) {
      return {
        agentId:    this.id,
        verdict:    'reject',
        confidence: 1.0,
        rationale:  'Circuit breaker is open. No rebalance until RiskEngine is reset.',
      };
    }

    // Check runway floor
    if (stable < RUNWAY_FLOOR_ETH) {
      return {
        agentId:    this.id,
        verdict:    'reject',
        confidence: 0.95,
        rationale:  `Stable reserve ${ethers.formatEther(stable)} ETH is below 6-month floor ${ethers.formatEther(RUNWAY_FLOOR_ETH)} ETH. Prioritise reserve top-up.`,
        evidence:   { stableEth: stable.toString(), floorEth: RUNWAY_FLOOR_ETH.toString() },
      };
    }

    // Compute target stable level
    const targetStable = (nav * TARGET_STABLE_FRACTION_BPS) / 10_000n;
    const excessStable = stable > targetStable ? stable - targetStable : 0n;

    // If there's excess stable and VaR headroom, recommend a buyback/rebalance
    if (excessStable > 0n && dailyVar < snapshot.dailyVaREth / 2n) {
      const allocatable = excessStable / 4n; // only deploy 25% of excess per cycle
      return {
        agentId:    this.id,
        verdict:    'approve',
        confidence: 0.75,
        rationale:  `NAV surplus: ${ethers.formatEther(excessStable)} ETH above target stable (${TARGET_STABLE_FRACTION_BPS}bps). Recommend deploying ${ethers.formatEther(allocatable)} ETH into highest-rated active strategy.`,
        evidence:   {
          navEth:        nav.toString(),
          stableEth:     stable.toString(),
          targetStable:  targetStable.toString(),
          excessStable:  excessStable.toString(),
          allocatable:   allocatable.toString(),
          dailyVarEth:   dailyVar.toString(),
        },
      };
    }

    return {
      agentId:    this.id,
      verdict:    'abstain',
      confidence: 0.6,
      rationale:  'No actionable rebalance signal. Treasury within target bands.',
    };
  }
}
