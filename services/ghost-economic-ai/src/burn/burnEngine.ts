/**
 * GST Burn Engine
 *
 * Evaluates deflation conditions and submits advisory burn proposals to the
 * signing relay when either of the following thresholds is met:
 *
 *   1. HIGH_TPS  — average TPS exceeds AEE_BURN_TPS_THRESHOLD
 *   2. SURPLUS   — treasury balance exceeds AEE_BURN_SURPLUS_GST
 *
 * A per-condition cooldown (AEE_BURN_COOLDOWN_MIN) prevents proposal spam.
 *
 * The actual on-chain burn requires governance ratification — this engine
 * never executes burns autonomously.
 */

import { type MarketMetrics, type TreasuryState, type EconomicProposal } from '../types.js';
import { submitProposal }                                                  from '../proposals.js';

const BURN_TPS_THRESHOLD  = Number(process.env.AEE_BURN_TPS_THRESHOLD  ?? 300);
const BURN_SURPLUS_GST    = Number(process.env.AEE_BURN_SURPLUS_GST    ?? 50_000_000);
const BURN_AMOUNT_GST     = Number(process.env.AEE_BURN_AMOUNT_GST     ?? 10_000);
const COOLDOWN_MS         = Number(process.env.AEE_BURN_COOLDOWN_MIN   ?? 30) * 60_000;

let _lastBurnTs = 0;

export async function evaluateBurn(
  market:   MarketMetrics,
  treasury: TreasuryState
): Promise<EconomicProposal | null> {
  const now           = Date.now();
  const highTps       = market.tpsAvg > BURN_TPS_THRESHOLD;
  const surplusActive = treasury.balanceGst > BURN_SURPLUS_GST;

  if (!highTps && !surplusActive) return null;
  if (now - _lastBurnTs < COOLDOWN_MS)  return null;

  const reasons: string[] = [];
  if (highTps)       reasons.push(`high TPS (${market.tpsAvg.toFixed(1)} > ${BURN_TPS_THRESHOLD})`);
  if (surplusActive) reasons.push(`treasury surplus (${treasury.balanceGst.toFixed(0)} GST > ${BURN_SURPLUS_GST.toLocaleString()})`);

  const proposal: EconomicProposal = {
    id:        `aee-burn-${now}`,
    ts:        now,
    source:    'ghost-economic-ai',
    target:    'burn',
    action:    'burn_gst',
    amountGst: BURN_AMOUNT_GST,
    reason:    `GST deflationary burn triggered by: ${reasons.join('; ')}`,
    advisory:  true,
    metadata:  {
      burnAmountGst:     BURN_AMOUNT_GST,
      currentTps:        market.tpsAvg.toFixed(2),
      tpsThreshold:      BURN_TPS_THRESHOLD,
      treasuryBalanceGst: treasury.balanceGst.toFixed(0),
      surplusThreshold:  BURN_SURPLUS_GST,
      triggers:          { highTps, surplusActive },
    },
  };

  await submitProposal(proposal);
  _lastBurnTs = now;

  console.log(`[AEE:burn] proposal submitted — ${BURN_AMOUNT_GST.toLocaleString()} GST (${reasons.join(', ')})`);
  return proposal;
}
