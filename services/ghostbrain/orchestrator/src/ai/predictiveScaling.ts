/**
 * ai/predictiveScaling.ts — Predictive scaling advisor for GhostChain validators.
 *
 * GOVERNANCE INVARIANT:
 *   This module only *proposes* scaling actions.  All proposals are forwarded
 *   to the signing relay at :7910 for human ratification — never executed inline.
 *
 * Security:
 *   - No user-supplied URLs; signing relay URL from config only
 *   - AbortController timeout on relay POST
 *   - Proposals are idempotent (duplicate suppression via proposal window)
 */

import { randomUUID } from "crypto";
import { request } from "undici";
import { SIGNING_RELAY_URL, THRESHOLDS } from "../config.js";
import type {
  AnomalyEvent,
  OrchestratorSnapshot,
  ScalingAction,
  ScalingProposal,
} from "../types.js";
import { recordProposal } from "../orchestrator/infrastructureManager.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Prevent duplicate proposals within 5 minutes. */
const _proposed = new Map<string, number>(); // key → timestamp

function isDuplicate(key: string): boolean {
  const last = _proposed.get(key);
  if (!last) return false;
  return Date.now() - last < 5 * 60_000;
}

function markProposed(key: string): void {
  _proposed.set(key, Date.now());
  // Cleanup old entries
  for (const [k, ts] of _proposed.entries()) {
    if (Date.now() - ts > 30 * 60_000) _proposed.delete(k);
  }
}

/** Forward the proposal to the governance signing relay. */
async function sendToRelay(
  proposal: ScalingProposal,
): Promise<{ ok: boolean; response: string }> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), THRESHOLDS.rpcTimeoutMs);

  try {
    const { statusCode, body } = await request(`${SIGNING_RELAY_URL}/proposals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(proposal),
      signal: ac.signal,
    });

    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    const text = Buffer.concat(chunks).toString().slice(0, 500);

    return {
      ok:       statusCode >= 200 && statusCode < 300,
      response: text,
    };
  } catch (err) {
    return { ok: false, response: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

// ── Scaling analysis ──────────────────────────────────────────────────────────

interface ScalingRecommendation {
  action:       ScalingAction;
  reason:       string;
  targetCount:  number;
  currentCount: number;
}

function analyzeValidatorScaling(
  snapshot: OrchestratorSnapshot,
): ScalingRecommendation | null {
  const total  = snapshot.validators.length;
  const jailed = snapshot.validators.filter((v) => v.jailed).length;
  const active = total - jailed;

  if (total === 0) return null;

  const participationPct = (active / total) * 100;

  if (participationPct < THRESHOLDS.validatorQuorumPct && active < 20) {
    return {
      action:       "scale_up",
      reason:       `Participation ${participationPct.toFixed(1)}% below quorum (${THRESHOLDS.validatorQuorumPct}%). Adding validators.`,
      targetCount:  Math.min(total + 5, 100),
      currentCount: total,
    };
  }

  if (participationPct > 95 && total > 21) {
    return {
      action:       "rebalance",
      reason:       `All validators active (${participationPct.toFixed(1)}%). Consider rebalancing stake.`,
      targetCount:  total,
      currentCount: total,
    };
  }

  return null;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Evaluate the snapshot and emit a scaling proposal if needed.
 * The proposal is sent to the signing relay (requires governance ratification).
 * Returns the created proposal, or null if no action needed.
 */
export async function evaluateScaling(
  snapshot:  OrchestratorSnapshot,
  _anomalies: AnomalyEvent[],
): Promise<ScalingProposal | null> {
  const rec = analyzeValidatorScaling(snapshot);
  if (!rec || rec.action === "none") return null;

  const dedupKey = `${rec.action}:${rec.targetCount}`;
  if (isDuplicate(dedupKey)) return null;

  const proposal: ScalingProposal = {
    id:                 randomUUID(),
    action:             rec.action,
    reason:             rec.reason,
    targetCount:        rec.targetCount,
    currentCount:       rec.currentCount,
    requiresGovernance: true,
    sentToRelay:        false,
    proposedAt:         Date.now(),
  };

  const { ok, response } = await sendToRelay(proposal);
  proposal.sentToRelay   = ok;
  proposal.relayResponse = response;

  markProposed(dedupKey);
  recordProposal(proposal);

  return proposal;
}
