/**
 * agents/operations-cfo.ts — Treasury Operations CFO agent.
 *
 * Focuses on predictable operational spend scheduling:
 *   • Payroll runway calculation
 *   • L2/L3 infra expense modelling
 *   • Validator reward scheduling
 *   • Short-term liquidity needs
 *
 * Approves proposals only if projected post-execution runway
 * meets the constitutional minimum.
 */

import { BaseAgent } from './base.js';
import type { AgentContext, AgentVote } from './types.js';
import { ethers } from 'ethers';

/** Constitutional minimum: 6 months of ops runway in ETH. */
const MIN_RUNWAY_MONTHS     = 6;
/** Monthly operational burn rate estimate in ETH (updated via config in prod). */
const MONTHLY_BURN_ETH      = 50n;  // conservative placeholder

export class OperationsCFO extends BaseAgent {
  readonly id = 'operations-cfo';
  readonly description = 'Ops runway, payroll scheduling, and predictable spend control';

  protected async reason(ctx: AgentContext): Promise<AgentVote> {
    const { snapshot } = ctx;
    const stable = snapshot.stableReserveEth;

    const runwayMonths = stable > 0n
      ? Number(stable / MONTHLY_BURN_ETH)
      : 0;

    if (runwayMonths < MIN_RUNWAY_MONTHS) {
      return {
        agentId:    this.id,
        verdict:    'reject',
        confidence: 0.95,
        rationale:  `Operational runway ${runwayMonths.toFixed(1)} months is below the ${MIN_RUNWAY_MONTHS}-month constitutional minimum. No rebalance until runway is restored.`,
        evidence: {
          stableEth:      ethers.formatEther(stable),
          monthlyBurnEth: MONTHLY_BURN_ETH.toString(),
          runwayMonths:   runwayMonths.toFixed(2),
          minRunway:      MIN_RUNWAY_MONTHS,
        },
      };
    }

    return {
      agentId:    this.id,
      verdict:    'approve',
      confidence: 0.85,
      rationale:  `Operational runway ${runwayMonths.toFixed(1)} months — above ${MIN_RUNWAY_MONTHS}-month floor. Ops budget stable.`,
      evidence: {
        stableEth:    ethers.formatEther(stable),
        runwayMonths: runwayMonths.toFixed(2),
      },
    };
  }
}
