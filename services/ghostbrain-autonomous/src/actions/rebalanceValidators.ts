/**
 * Rebalance Validators Action (Phase 47)
 *
 * Builds a resource-rebalance proposal and forwards it to the signing
 * relay for human ratification.  Future enhancements:
 *   - redistribute transaction routing
 *   - adjust block-producer weights
 *   - balance network load across regions
 *
 * No write is ever issued from this module.
 */

import { CONFIG } from "../config/rules.js";
import type { Proposal } from "../types.js";

let fetchFn: typeof fetch;

async function getFetch() {
  if (fetchFn) return fetchFn;
  if (typeof globalThis.fetch === "function") {
    fetchFn = globalThis.fetch;
  }
  return fetchFn;
}

/**
 * Forward a validator rebalance proposal to the signing relay.
 */
export async function rebalanceValidators(proposal: Proposal): Promise<Proposal> {
  if (CONFIG.dryRun) {
    console.log(`[rebalanceValidators] DRY_RUN — would propose rebalance for "${proposal.target}"`);
    return { ...proposal, status: "dry_run" };
  }

  try {
    const f = await getFetch();
    const r = await f(`${CONFIG.signingRelayUrl}/proposals`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        type:        "resource",
        action:      "rebalance",
        target:      proposal.target,
        requestedBy: "ghostbrain-autonomous",
        params:      proposal.payload,
        proposalId:  proposal.id,
        source:      proposal.source,
        reason:      proposal.reason,
        severity:    proposal.severity,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!r.ok) {
      console.error(`[rebalanceValidators] relay rejected: ${r.status}`);
      return { ...proposal, status: "send_failed" };
    }

    console.log(`[rebalanceValidators] rebalance proposal for "${proposal.target}" forwarded — awaiting human ratification`);
    return { ...proposal, status: "sent" };
  } catch (err) {
    console.error(`[rebalanceValidators] relay unreachable:`, (err as Error).message);
    return { ...proposal, status: "send_failed" };
  }
}
