/**
 * Oracle Manager
 *
 * Refreshes GhostChain's internal price oracle with cross-chain market data.
 *
 * Per GhostChain governance rules:
 *   - External price feeds are NEVER integrated directly (no Chainlink, no Pyth).
 *   - All prices route through the GhostBrain oracle layer (port 7900).
 *   - oracle_update actions may auto-execute when ALLOW_AUTO_EXEC=true (read-only on-chain write).
 *
 * Rate-limiting: only one oracle refresh per ORACLE_REFRESH_INTERVAL_MS.
 */
import { randomUUID }       from "node:crypto";
import type { MultichainState, MultichainAction } from "../types.js";
import { ALLOW_AUTO_EXEC }  from "../state.js";
import { LIQUIDITY_POLICY } from "../policies/liquidity-policy.js";

const GHOSTBRAIN_URL = process.env["GHOSTBRAIN_URL"] ?? "http://127.0.0.1:7900";

let _lastRefreshAt = 0;

/** Fire-and-forget price refresh call to GhostBrain oracle layer. */
async function notifyGhostBrain(markets: MultichainState["markets"]): Promise<void> {
  const prices = markets.map(m => ({
    symbol:        m.symbol,
    internalPrice: m.internalPrice,
    externalPrice: m.externalPrice,
    spreadPct:     m.spreadPct,
    source:        m.source,
  }));

  await fetch(`${GHOSTBRAIN_URL}/api/v1/think`, {
    method:  "POST",
    headers: { "content-type": "application/json" },
    body:    JSON.stringify({
      task:    "oracle_price_update",
      payload: { prices, source: "ghost-multichain-controller" },
      agent:   "ghost-multichain-controller",
    }),
    signal: AbortSignal.timeout(4_000),
  });
}

export async function updateOracles(state: MultichainState): Promise<MultichainAction[]> {
  const now = Date.now();

  if (now - _lastRefreshAt < LIQUIDITY_POLICY.ORACLE_REFRESH_INTERVAL_MS) {
    return []; // Rate-limited — wait for the next eligible cycle
  }

  if (state.markets.length === 0) {
    return []; // No market data to publish
  }

  // Fire-and-forget to GhostBrain — do NOT block the cycle on this call
  notifyGhostBrain(state.markets).catch(err => {
    console.warn("[oracle-manager] GhostBrain notify failed:", String(err));
  });

  _lastRefreshAt = now;

  const action: MultichainAction = {
    id:                   randomUUID(),
    type:                 "oracle_update",
    sourceChain:          "L1",
    destChain:            "L1",
    description:          `Oracle refresh: published ${state.markets.length} market price(s) to GhostBrain oracle layer.`,
    params: {
      marketCount:  state.markets.length,
      ghostbrainUrl: GHOSTBRAIN_URL,
      executed:     ALLOW_AUTO_EXEC, // oracle_update is eligible for auto-execution
    },
    timestamp:            now,
    risk:                 "low",
    requiresRatification: false,   // oracle price updates do not move funds
    sovereigntyValidated: true,    // internal L1→L1 route (GhostBrain)
  };

  return [action];
}
