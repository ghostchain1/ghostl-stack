/**
 * Restart Validator Action (Phase 46 — governance-corrected)
 *
 * SAFETY NOTE: The original spec called fetch(".../api/system/restart")
 * directly, which would be an unapproved autonomous write.  This
 * implementation instead builds a KernelCommand-shaped proposal and
 * POST-s it to the signing relay (port 7910) for human ratification.
 *
 * The signing relay validates the command through SafetyGuard before
 * dispatching it to a handler — and only after a human has Approved.
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
 * Forward a restart-validator proposal to the signing relay.
 *
 * The proposal is NOT executed here.  A human operator must Approve it
 * in the UI before the relay dispatches the KernelCommand.
 *
 * @param proposal  The pre-built restart proposal from a monitor.
 * @returns         The proposal with updated status.
 */
export async function restartValidator(proposal: Proposal): Promise<Proposal> {
  if (CONFIG.dryRun) {
    console.log(`[restartValidator] DRY_RUN — would propose restart for "${proposal.target}"`);
    return { ...proposal, status: "dry_run" };
  }

  try {
    const f = await getFetch();
    const r = await f(`${CONFIG.signingRelayUrl}/proposals`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        // KernelCommand fields — relay validates these via SafetyGuard
        type:        "docker",
        action:      "restart",
        target:      proposal.target,
        requestedBy: "ghostbrain-autonomous",
        params:      proposal.payload,
        // Proposal metadata for audit trail
        proposalId:  proposal.id,
        source:      proposal.source,
        reason:      proposal.reason,
        severity:    proposal.severity,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!r.ok) {
      const body = await r.text();
      console.error(`[restartValidator] relay rejected proposal for "${proposal.target}": ${r.status} ${body}`);
      return { ...proposal, status: "send_failed" };
    }

    console.log(`[restartValidator] proposal for "${proposal.target}" forwarded to signing relay — awaiting human ratification`);
    return { ...proposal, status: "sent" };
  } catch (err) {
    console.error(`[restartValidator] could not reach signing relay:`, (err as Error).message);
    return { ...proposal, status: "send_failed" };
  }
}
