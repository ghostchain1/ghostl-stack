/**
 * Treasury Strategy Action (Phase 48)
 *
 * Analyses treasury metrics and forwards a strategy recommendation
 * proposal to the signing relay for governance ratification.
 *
 * Future strategy capabilities (all require human approval):
 *   - cross-chain staking rebalancing
 *   - liquidity optimisation recommendations
 *   - yield farming parameter tuning
 *   - market-stabilisation proposals
 *
 * AI may WRITE proposals; humans must RATIFY them via governance quorum.
 */

import { CONFIG, STRATEGY } from "../config/rules.js";
import type { Proposal } from "../types.js";

let fetchFn: typeof fetch;

async function getFetch() {
  if (fetchFn) return fetchFn;
  if (typeof globalThis.fetch === "function") {
    fetchFn = globalThis.fetch;
  } else {
    const mod = await import("node-fetch");
    fetchFn = mod.default as unknown as typeof fetch;
  }
  return fetchFn;
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

interface TreasuryIntelligence {
  solvencyRatio?: number;
  totalSupply?:   number;
  yield?:         number;
  recommendations?: { action: string; priority: string }[];
}

/**
 * Fetch treasury intelligence and produce a strategy proposal when
 * the solvency ratio or yield diverges from targets.
 *
 * Returns null when the treasury is within acceptable parameters.
 */
export async function treasuryStrategy(): Promise<Proposal | null> {
  const now = new Date().toISOString();

  let intel: TreasuryIntelligence = {};
  try {
    const f = await getFetch();
    const r = await f(`${CONFIG.apiBase}/api/treasury/intelligence`, { signal: AbortSignal.timeout(8_000) });
    intel   = await r.json() as TreasuryIntelligence;
  } catch (err) {
    console.warn("[treasuryStrategy] fetch failed:", (err as Error).message);
    return null;
  }

  const solvency = intel.solvencyRatio ?? 1;
  const yieldPct = (intel.yield ?? 0) * 100;
  const reasons: string[] = [];

  if (solvency < 1.0) {
    reasons.push(`Solvency ratio ${solvency.toFixed(2)} < 1.0 — critical`);
  } else if (solvency < 1.2) {
    reasons.push(`Solvency ratio ${solvency.toFixed(2)} below comfortable 1.2× buffer`);
  }

  if (yieldPct > 0 && yieldPct < STRATEGY.treasuryYieldTarget) {
    reasons.push(`Treasury yield ${yieldPct.toFixed(1)}% below target ${STRATEGY.treasuryYieldTarget}%`);
  }

  if (reasons.length === 0) return null;

  const proposal: Proposal = {
    id:         makeId(),
    type:       "treasury_strategy",
    kernelType: "alert",
    action:     "alert",
    target:     "treasury",
    severity:   solvency < 1.0 ? "critical" : "warning",
    reason:     reasons.join("; "),
    payload: {
      solvencyRatio: solvency,
      yield:         yieldPct,
      targetYield:   STRATEGY.treasuryYieldTarget,
      aiRecommendations: intel.recommendations ?? [],
    },
    createdAt: now,
    status:    "pending",
    source:    "treasuryStrategy",
  };

  if (CONFIG.dryRun) {
    console.log(`[treasuryStrategy] DRY_RUN — treasury proposal:`, proposal.reason);
    return { ...proposal, status: "dry_run" };
  }

  try {
    const f = await getFetch();
    const r = await f(`${CONFIG.signingRelayUrl}/proposals`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ ...proposal, requestedBy: "ghostbrain-autonomous" }),
      signal:  AbortSignal.timeout(10_000),
    });

    if (!r.ok) {
      console.error(`[treasuryStrategy] relay rejected: ${r.status}`);
      return { ...proposal, status: "send_failed" };
    }

    console.log("[treasuryStrategy] proposal forwarded to signing relay — awaiting human ratification");
    return { ...proposal, status: "sent" };
  } catch (err) {
    console.error(`[treasuryStrategy] relay unreachable:`, (err as Error).message);
    return { ...proposal, status: "send_failed" };
  }
}
