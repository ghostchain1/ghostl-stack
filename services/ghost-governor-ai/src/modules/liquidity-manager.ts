/**
 * Liquidity Manager
 *
 * Monitors L2 GST pool reserves against policy minimums.
 * Proposes inject or withdraw actions for human ratification.
 *
 * Policy (from liquidity-policy.ts):
 *   - L2 GST reserve < MIN_GST_RESERVE_PCT → propose injection of INJECT_AMOUNT
 *   - Single pool TVL concentration > MAX_TVL_CONCENTRATION_PCT → propose withdrawal
 *
 * Anti-thrash: proposals are suppressed if fewer than MIN_REBALANCE_INTERVAL_CYCLES
 * have passed since the last rebalance proposal (tracked in module state).
 */
import { randomUUID } from "node:crypto";
import type { NetworkState, GovernorProposal } from "../types.js";
import { LIQUIDITY_POLICY } from "../policies/liquidity-policy.js";

// Per-session cycle counter for anti-thrash guard
let lastRebalanceCycle = -LIQUIDITY_POLICY.MIN_REBALANCE_INTERVAL_CYCLES;
let globalCycle = 0;

export function incrementCycle(): void {
  globalCycle++;
}

export async function manageLiquidity(network: NetworkState): Promise<GovernorProposal[]> {
  const proposals: GovernorProposal[] = [];
  const now = Date.now();

  const cooldown = globalCycle - lastRebalanceCycle < LIQUIDITY_POLICY.MIN_REBALANCE_INTERVAL_CYCLES;

  if (!cooldown) {
    // Low reserve — propose injection
    if (network.liquidity.low) {
      lastRebalanceCycle = globalCycle;
      proposals.push({
        id:          randomUUID(),
        type:        "liquidity_inject",
        description: `L2 GST reserve at ${network.liquidity.l2GstReservePct.toFixed(1)}% — below policy minimum ${LIQUIDITY_POLICY.MIN_GST_RESERVE_PCT}%. Propose injecting ${LIQUIDITY_POLICY.INJECT_AMOUNT / 10n ** 18n} GST into liquidity pools.`,
        params: {
          currentReservePct: network.liquidity.l2GstReservePct,
          policyMinPct:      LIQUIDITY_POLICY.MIN_GST_RESERVE_PCT,
          injectAmountWei:   LIQUIDITY_POLICY.INJECT_AMOUNT.toString(),
          totalTVLWei:       network.liquidity.totalTVL.toString(),
          pools:             network.liquidity.pools.map(p => p.address),
        },
        timestamp:            now,
        risk:                 "medium",
        requiresRatification: true,
        autoExecute:          false,
      });
    }

    // Over-concentrated pool — propose partial withdrawal
    if (network.liquidity.high) {
      const concentratedPool = network.liquidity.pools
        .sort((a, b) => Number(b.tvl - a.tvl))[0];

      if (concentratedPool) {
        lastRebalanceCycle = globalCycle;
        proposals.push({
          id:          randomUUID(),
          type:        "liquidity_withdraw",
          description: `L2 pool concentration risk: pool ${concentratedPool.address} holds > ${LIQUIDITY_POLICY.MAX_TVL_CONCENTRATION_PCT}% of TVL. Propose withdrawing ${LIQUIDITY_POLICY.WITHDRAW_AMOUNT / 10n ** 18n} GST to rebalance.`,
          params: {
            poolAddress:      concentratedPool.address,
            poolTVLWei:       concentratedPool.tvl.toString(),
            totalTVLWei:      network.liquidity.totalTVL.toString(),
            withdrawAmountWei: LIQUIDITY_POLICY.WITHDRAW_AMOUNT.toString(),
          },
          timestamp:            now,
          risk:                 "medium",
          requiresRatification: true,
          autoExecute:          false,
        });
      }
    }
  }

  return proposals;
}
