/**
 * Cross-Chain Yield Engine
 *
 * Analyzes yield opportunities and submits advisory proposals to the signing
 * relay when a strategy is viable.
 *
 * ARCHITECTURAL NOTE:
 *   L2 and L3 never call external chains. GhostChain L1 is the sole actor
 *   for any cross-chain interactions. This engine never makes RPC calls to
 *   any legacy external network. It computes strategy
 *   recommendations from chain-internal metrics and delegates execution to
 *   the L1 treasury (via signed governance proposals).
 *
 * Cooldown: AEE_YIELD_COOLDOWN_MIN (default 120 min) between proposals.
 */

import { type MarketMetrics, type TreasuryState, type EconomicProposal } from '../types.js';
import { submitProposal }                                                  from '../proposals.js';
import { selectBestStrategy }                                              from './strategyPlanner.js';

const COOLDOWN_MS      = Number(process.env.AEE_YIELD_COOLDOWN_MIN  ?? 120) * 60_000;
const MIN_DEPLOY_GST   = Number(process.env.AEE_YIELD_MIN_DEPLOY_GST ?? 100_000);
// Minimum reserve kept in treasury before any yield deployment
const RESERVE_FLOOR_GST = Number(process.env.AEE_YIELD_RESERVE_FLOOR_GST ?? 10_000_000);

let _lastYieldTs = 0;

export async function planYieldStrategies(
  treasury: TreasuryState,
  market:   MarketMetrics
): Promise<EconomicProposal | null> {
  const now = Date.now();
  if (now - _lastYieldTs < COOLDOWN_MS) return null;

  // Don't deploy if below reserve floor
  const deployableGst = treasury.balanceGst - RESERVE_FLOOR_GST;
  if (deployableGst < MIN_DEPLOY_GST) return null;

  const strategy = selectBestStrategy(market);
  if (!strategy) return null;

  const deployGst = Math.min(deployableGst * 0.20, strategy.maxCapGst); // deploy ≤20% of excess

  const proposal: EconomicProposal = {
    id:        `aee-yield-${now}`,
    ts:        now,
    source:    'ghost-economic-ai',
    target:    'yield',
    action:    `deploy_yield_strategy_${strategy.id}`,
    amountGst: deployGst,
    reason:    `Yield opportunity: ${strategy.description} @ ${strategy.aprPct}% APR (${strategy.riskLevel} risk)`,
    advisory:  true,
    metadata:  {
      strategyId:         strategy.id,
      aprPct:             strategy.aprPct,
      riskLevel:          strategy.riskLevel,
      deployAmountGst:    deployGst.toFixed(0),
      treasuryBalanceGst: treasury.balanceGst.toFixed(0),
      reserveFloorGst:    RESERVE_FLOOR_GST,
    },
  };

  await submitProposal(proposal);
  _lastYieldTs = now;

  console.log(`[AEE:yield] strategy="${strategy.id}" deployGst=${deployGst.toFixed(0)}`);
  return proposal;
}
