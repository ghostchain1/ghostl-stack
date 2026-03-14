/**
 * Liquidity Router
 *
 * Identifies cross-chain liquidity imbalances and generates rebalancing proposals.
 *
 * Strategy:
 *   If a pool's external APR exceeds its internal APR by MIN_APR_DIFF_PCT,
 *   propose moving up to MAX_MOVE_BPS of the pool's TVL to the external chain
 *   via GhostChain L1 bridge.
 *
 * Sovereignty enforcement:
 *   All proposals route via L1 → external (never L2/L3 directly to external).
 *
 * All proposals ALWAYS require human ratification — no autonomous fund movement.
 */
import { randomUUID }       from "node:crypto";
import type { MultichainState, MultichainAction } from "../types.js";
import { LIQUIDITY_POLICY } from "../policies/liquidity-policy.js";
import { buildSovereignRoute } from "../policies/sovereignty-policy.js";
import { checkTreatyAllowance } from "./treaty-manager.js";

// Placeholder treasury balance — operators set TREASURY_GST_WEI env var.
// In production this is read from GhostChain L1 SovereignTreasuryEngine contract.
const TREASURY_GST_WEI = process.env["TREASURY_GST_WEI"] ?? "0";

export async function routeLiquidity(state: MultichainState): Promise<MultichainAction[]> {
  const actions: MultichainAction[] = [];
  const now = Date.now();

  for (const pool of state.pools) {
    if (!pool.rebalanceNeeded) continue;

    const aprDiff = pool.aprExternal - pool.aprInternal;
    if (aprDiff <= LIQUIDITY_POLICY.MIN_APR_DIFF_PCT) continue;

    // Compute proposed move amount: MAX_MOVE_BPS of TVL
    const tvl = BigInt(pool.tvlGst);
    if (tvl === 0n) continue;

    const moveAmount = (tvl * BigInt(LIQUIDITY_POLICY.MAX_MOVE_BPS)) / 10_000n;

    // Build and validate the sovereign route (L1 → external)
    let route;
    try {
      route = buildSovereignRoute("L1", pool.externalChain);
    } catch (err) {
      console.warn(`[liquidity-router] invalid route for pool ${pool.id}: ${String(err)}`);
      continue;
    }

    // Check treaty allowance
    const treatyOk = checkTreatyAllowance(pool.externalChain, moveAmount.toString(), TREASURY_GST_WEI);
    if (!treatyOk) {
      console.log(
        `[liquidity-router] pool ${pool.id}: treaty blocks move of ${moveAmount} GST to ${pool.externalChain}`,
      );
      continue;
    }

    actions.push({
      id:          randomUUID(),
      type:        "liquidity_rebalance",
      sourceChain: route.originLayer,
      destChain:   route.destination,
      description: `Pool "${pool.id}" (${pool.token0}/${pool.token1}): ` +
                   `external APR ${pool.aprExternal.toFixed(2)}% > internal ${pool.aprInternal.toFixed(2)}% ` +
                   `(Δ${aprDiff.toFixed(2)}%). Propose moving ${LIQUIDITY_POLICY.MAX_MOVE_BPS}bps ` +
                   `of TVL (${moveAmount.toString()} GST wei) to ${pool.externalChain} via L1.`,
      params: {
        poolId:        pool.id,
        token0:        pool.token0,
        token1:        pool.token1,
        aprInternal:   pool.aprInternal,
        aprExternal:   pool.aprExternal,
        aprDiffPct:    aprDiff,
        moveAmountGst: moveAmount.toString(),
        externalChain: pool.externalChain,
        route:         `${route.originLayer} → ${route.destination}`,
      },
      timestamp:            now,
      risk:                 aprDiff > 10 ? "medium" : "low",
      requiresRatification: true,
      sovereigntyValidated: true,
    });
  }

  return actions;
}
