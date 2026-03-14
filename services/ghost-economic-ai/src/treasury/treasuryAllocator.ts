/**
 * Treasury Allocator
 *
 * Computes the target allocation of treasury funds across operational buckets
 * and submits an advisory proposal to the signing relay when a rebalance is
 * detected as necessary.
 *
 * Ratios are configurable via env — defaults to the GhostStack economic policy:
 *   operations 30% | validators 40% | liquidity 20% | reserve 10%
 *
 * ALL proposals are advisory: true — humans must ratify before execution.
 */

import { type TreasuryState, type Allocation, type EconomicProposal } from '../types.js';
import { submitProposal }                                               from '../proposals.js';

const ALLOC_OPS  = Number(process.env.AEE_ALLOC_OPS        ?? 0.30);
const ALLOC_VAL  = Number(process.env.AEE_ALLOC_VALIDATORS ?? 0.40);
const ALLOC_LIQ  = Number(process.env.AEE_ALLOC_LIQUIDITY  ?? 0.20);
const ALLOC_RES  = Number(process.env.AEE_ALLOC_RESERVE    ?? 0.10);
// Minimum rebalance interval — don't spam proposals
const REBAL_INTERVAL_MS = Number(process.env.AEE_ALLOC_INTERVAL_MIN ?? 60) * 60_000;

let _lastProposalTs = 0;

/** Pure function: compute target allocation from a treasury state. */
export function allocateFunds(treasury: TreasuryState): Allocation {
  const total = treasury.balanceGst;
  return {
    operations:    ALLOC_OPS,
    validators:    ALLOC_VAL,
    liquidity:     ALLOC_LIQ,
    reserve:       ALLOC_RES,
    operationsGst: total * ALLOC_OPS,
    validatorsGst: total * ALLOC_VAL,
    liquidityGst:  total * ALLOC_LIQ,
    reserveGst:    total * ALLOC_RES,
  };
}

/**
 * Evaluate whether an allocation proposal should be submitted.
 * Gated by REBAL_INTERVAL_MS to avoid proposal spam.
 */
export async function evaluateAllocation(
  treasury: TreasuryState
): Promise<EconomicProposal | null> {
  const now = Date.now();
  if (now - _lastProposalTs < REBAL_INTERVAL_MS) return null;

  const alloc = allocateFunds(treasury);
  const proposal: EconomicProposal = {
    id:        `aee-alloc-${now}`,
    ts:        now,
    source:    'ghost-economic-ai',
    target:    'allocation',
    action:    'rebalance_treasury',
    amountGst: treasury.balanceGst,
    reason:    `Scheduled treasury allocation review. Balance: ${treasury.balanceGst.toFixed(0)} GST`,
    advisory:  true,
    metadata:  {
      operations:    alloc.operationsGst.toFixed(0),
      validators:    alloc.validatorsGst.toFixed(0),
      liquidity:     alloc.liquidityGst.toFixed(0),
      reserve:       alloc.reserveGst.toFixed(0),
      ratios:        { ALLOC_OPS, ALLOC_VAL, ALLOC_LIQ, ALLOC_RES },
    },
  };

  await submitProposal(proposal);
  _lastProposalTs = now;
  return proposal;
}
