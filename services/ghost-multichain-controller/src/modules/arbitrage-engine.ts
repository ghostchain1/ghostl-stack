/**
 * Arbitrage Engine
 *
 * Detects cross-chain price differentials between GhostXchange (internal) and
 * external DEXes. When a spread exceeds MIN_ARBITRAGE_SPREAD_PCT, an
 * arbitrage_propose action is generated for human review.
 *
 * Per GhostChain governance rules:
 *   - AI may PROPOSE arbitrage opportunities — humans must RATIFY execution.
 *   - No autonomous cross-chain fund movement without governance approval.
 *   - All routes enforce the sovereignty rule: always via GhostChain L1.
 *
 * Example:
 *   GST/USD on GhostXchange = $1.00
 *   GST/USD on GhostBridge DEX = $1.05
 *   Spread = 5% → arbitrage_propose generated
 */
import { randomUUID }       from "node:crypto";
import type { MultichainState, MultichainAction } from "../types.js";
import { LIQUIDITY_POLICY } from "../policies/liquidity-policy.js";
import { buildSovereignRoute } from "../policies/sovereignty-policy.js";
import { checkTreatyAllowance } from "./treaty-manager.js";

const TREASURY_GST_WEI = process.env["TREASURY_GST_WEI"] ?? "0";

// Default arbitrage size when no specific max is configured: 10,000 GST
const DEFAULT_ARB_SIZE_GST_WEI = (10_000n * 10n ** 18n).toString();
const MAX_ARB_SIZE_GST_WEI     = process.env["ARB_MAX_SIZE_GST_WEI"] ?? DEFAULT_ARB_SIZE_GST_WEI;

export async function runArbitrage(state: MultichainState): Promise<MultichainAction[]> {
  const actions: MultichainAction[] = [];
  const now = Date.now();

  for (const market of state.markets) {
    if (market.spreadPct < LIQUIDITY_POLICY.MIN_ARBITRAGE_SPREAD_PCT) continue;

    const higher = market.externalPrice > market.internalPrice ? "external" : "internal";

    // Determine direction: buy where cheap, sell where expensive
    let route;
    try {
      // If external is higher: buy on GhostXchange (L1) → sell externally
      // Route: L1 → external chain
      if (higher === "external") {
        route = buildSovereignRoute("L1", market.externalChain);
      } else {
        // External is cheaper: buy externally → bring to L1 for arbitrage
        route = buildSovereignRoute(market.externalChain, "L1");
      }
    } catch (err) {
      console.warn(`[arbitrage-engine] invalid route for market ${market.symbol}: ${String(err)}`);
      continue;
    }

    // Check treaty allowance before proposing
    const arbSize = MAX_ARB_SIZE_GST_WEI;
    const treatyOk = higher === "external"
      ? checkTreatyAllowance(market.externalChain, arbSize, TREASURY_GST_WEI) // outbound
      : true; // inbound (no treaty restriction on receiving)

    const riskLevel = market.spreadPct > 10 ? "high" : market.spreadPct > 5 ? "medium" : "low";

    actions.push({
      id:          randomUUID(),
      type:        "arbitrage_propose",
      sourceChain: route.originLayer,
      destChain:   route.destination,
      description: `Arbitrage opportunity: ${market.symbol} spread=${market.spreadPct.toFixed(2)}% ` +
                   `(internal=$${market.internalPrice.toFixed(4)}, external=$${market.externalPrice.toFixed(4)}). ` +
                   `Direction: buy on ${higher === "external" ? "GhostXchange (L1)" : market.externalChain}, ` +
                   `sell on ${higher === "external" ? market.externalChain : "GhostXchange (L1)"}. ` +
                   `Max size: ${arbSize} GST wei. Treaty check: ${treatyOk ? "PASS" : "BLOCKED"}.`,
      params: {
        symbol:        market.symbol,
        internalPrice: market.internalPrice,
        externalPrice: market.externalPrice,
        spreadPct:     market.spreadPct,
        direction:     higher === "external" ? "buy-internal-sell-external" : "buy-external-sell-internal",
        externalChain: market.externalChain,
        maxSizeGst:    arbSize,
        treatyAllowed: treatyOk,
        route:         `${route.originLayer} → ${route.destination}`,
        source:        market.source,
      },
      timestamp:            now,
      risk:                 riskLevel,
      requiresRatification: true,   // ALWAYS — AI can only propose, humans execute
      sovereigntyValidated: true,
    });
  }

  return actions;
}
