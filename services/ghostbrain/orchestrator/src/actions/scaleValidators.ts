/**
 * actions/scaleValidators.ts — Submit a validator scaling proposal.
 *
 * GOVERNANCE INVARIANT:
 *   This action NEVER writes on-chain.  It forwards a signed proposal to the
 *   governance signing relay at :7910 where a human operator ratifies it.
 *
 * Security:
 *   - Relay URL from config only
 *   - AbortController timeout
 *   - Callers must hold a valid HMAC token (enforced in server.ts)
 */

import { randomUUID } from "crypto";
import { evaluateScaling } from "../ai/predictiveScaling.js";
import type { ActionResult, OrchestratorSnapshot, ScalingProposal } from "../types.js";
import { getSnapshot } from "../orchestrator/infrastructureManager.js";

// ── Exported action ───────────────────────────────────────────────────────────

export interface ScaleRequest {
  reason?: string;
  /** Target validator count. If omitted, ai/predictiveScaling decides. */
  targetCount?: number;
}

/**
 * Trigger a validator scaling proposal. The current snapshot is analysed and
 * a proposal is forwarded to the signing relay.  No on-chain write is made.
 */
export async function scaleValidators(req: ScaleRequest): Promise<ActionResult & { proposal?: ScalingProposal }> {
  const start    = Date.now();
  const snapshot: OrchestratorSnapshot = getSnapshot();

  const proposal = await evaluateScaling(snapshot, snapshot.anomalies);

  if (!proposal) {
    return {
      ok:         true,
      message:    "No scaling action required at this time (or duplicate suppressed)",
      durationMs: Date.now() - start,
      timestamp:  Date.now(),
    };
  }

  return {
    ok:         proposal.sentToRelay,
    message:    proposal.sentToRelay
      ? `Scaling proposal ${proposal.id} forwarded to signing relay`
      : `Scaling proposal created but relay delivery failed: ${proposal.relayResponse ?? "unknown"}`,
    durationMs:  Date.now() - start,
    timestamp:   Date.now(),
    proposal,
  };
}
