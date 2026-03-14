/**
 * AI Decision Engine (Phase 50)
 *
 * Maps raw detections to prioritised, deduplicated Proposals and
 * determines which should be forwarded to the signing relay.
 *
 * Decision logic:
 *   - Deduplication: two proposals with the same (type, target) within
 *     the dedup window are collapsed into one (highest severity wins).
 *   - Priority: critical > warning > info.
 *   - Suppression: "alert_*" types are always forwarded; action types
 *     (restart, rebalance, scale) are only forwarded when they clear
 *     severity ≥ the configured forwardThreshold.
 *
 * The engine does NOT execute anything.  It returns the final proposal
 * list for the relay dispatcher to forward.
 */

import { STRATEGY } from "../config/rules.js";
import type { Proposal, ProposalSeverity } from "../types.js";

// ── Severity ordering ───────────────────────────────────────────────────────

const SEV_ORDER: Record<ProposalSeverity, number> = {
  info:     0,
  warning:  1,
  critical: 2,
};

// ── Dedup registry ──────────────────────────────────────────────────────────

/** key → last proposal id forwarded, used to suppress duplicates. */
const _dedupRegistry = new Map<string, { id: string; ts: number }>();
const DEDUP_WINDOW_MS = 5 * 60 * 1_000; // 5 minutes

function dedupKey(p: Proposal): string {
  return `${p.type}::${p.target}`;
}

function clearStaleDedupEntries() {
  const cutoff = Date.now() - DEDUP_WINDOW_MS;
  for (const [k, v] of _dedupRegistry) {
    if (v.ts < cutoff) _dedupRegistry.delete(k);
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

export interface DecisionResult {
  /** Proposals that should be forwarded to the signing relay. */
  toForward: Proposal[];
  /** Proposals suppressed by dedup or below threshold. */
  suppressed: Proposal[];
  /** Informational: current strategy targets from strategyEngine. */
  strategySnapshot: typeof STRATEGY;
}

/**
 * Process a batch of raw proposals from all monitors.
 *
 * @param raw           All proposals collected this cycle.
 * @param forwardMinSev Minimum severity to forward action proposals.
 *                      Alert proposals (type starts "alert_") always forward.
 */
export function decide(
  raw: Proposal[],
  forwardMinSev: ProposalSeverity = "warning",
): DecisionResult {
  clearStaleDedupEntries();

  const toForward:  Proposal[] = [];
  const suppressed: Proposal[] = [];

  for (const p of raw) {
    const key          = dedupKey(p);
    const existing     = _dedupRegistry.get(key);
    const isAlert      = p.type.startsWith("alert_");
    const sevOk        = SEV_ORDER[p.severity] >= SEV_ORDER[forwardMinSev];
    const isDuplicate  = existing != null;

    if (isDuplicate) {
      // If incoming severity is higher than the previously seen entry, upgrade
      // and re-forward; otherwise suppress.
      const prevEntry = _dedupRegistry.get(key)!;
      const prevSev   = raw.find(x => x.id === prevEntry.id)?.severity ?? "info";
      if (SEV_ORDER[p.severity] > SEV_ORDER[prevSev]) {
        _dedupRegistry.set(key, { id: p.id, ts: Date.now() });
        toForward.push(p);
      } else {
        suppressed.push(p);
      }
      continue;
    }

    if (isAlert || sevOk) {
      _dedupRegistry.set(key, { id: p.id, ts: Date.now() });
      toForward.push(p);
    } else {
      suppressed.push(p);
    }
  }

  // Sort: critical first, then by creation time
  toForward.sort((a, b) => {
    const sevDiff = SEV_ORDER[b.severity] - SEV_ORDER[a.severity];
    return sevDiff !== 0 ? sevDiff : a.createdAt.localeCompare(b.createdAt);
  });

  return { toForward, suppressed, strategySnapshot: STRATEGY };
}
