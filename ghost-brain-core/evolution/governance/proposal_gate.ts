/**
 * GhostBrain Self-Evolution Engine — Proposal Gate
 *
 * Polls the signing relay for the human ratification status of a submitted
 * EvolutionProposal.  No on-chain action is taken autonomously — the relay
 * determines when (and whether) the proposal is applied.
 *
 * This module enforces the constitutional invariant:
 *   "AI may write proposals; humans must ratify them."
 *
 * SECURITY INVARIANTS
 * -------------------
 * 1. SIGNING_RELAY_URL is environment-only — never user-controlled.
 * 2. relayPendingId is validated as a non-empty, URL-safe identifier.
 * 3. fetch() uses AbortController per poll — no uncancelable fetches.
 * 4. Maximum wait time enforced — engine does not poll forever.
 * 5. No transaction submission; relay handles all signing and dispatch.
 */

import type { ProposalStatus, ProposalReceipt } from "../types.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const RELAY_URL = (
  process.env["SIGNING_RELAY_URL"] ?? "http://localhost:7910"
).replace(/\/$/, "");

/** How long to wait between relay status polls. */
const POLL_INTERVAL_MS = parseInt(
  process.env["PROPOSAL_POLL_INTERVAL_MS"] ?? "30000", 10,
);

/** Maximum time to wait for human ratification (default 24 hours). */
const MAX_WAIT_MS = parseInt(
  process.env["PROPOSAL_MAX_WAIT_MS"] ?? String(24 * 60 * 60_000), 10,
);

/** Per-request fetch timeout. */
const FETCH_TIMEOUT_MS = parseInt(
  process.env["PROPOSAL_FETCH_TIMEOUT_MS"] ?? "8000", 10,
);

/** Only these characters are allowed in a relay pending ID. */
const SAFE_PENDING_ID_RE = /^[a-zA-Z0-9_\-]{1,128}$/;

// ---------------------------------------------------------------------------
// ProposalGate
// ---------------------------------------------------------------------------

export class ProposalGate {
  /**
   * Poll the signing relay until the proposal reaches a terminal state or the
   * max wait time is exhausted.
   *
   * Terminal states: "approved", "rejected", "expired"
   * Non-terminal (keep polling): "pending_ratification", "under_review"
   *
   * Returns the final ProposalReceipt.
   */
  async waitForRatification(receipt: ProposalReceipt): Promise<ProposalReceipt> {
    if (!SAFE_PENDING_ID_RE.test(receipt.relayPendingId)) {
      return {
        ...receipt,
        status: "rejected",
        error:  `invalid relayPendingId format: "${receipt.relayPendingId}"`,
      };
    }

    const deadline = Date.now() + MAX_WAIT_MS;
    let current = receipt;

    while (Date.now() < deadline) {
      // Terminal — stop polling.
      if (isTerminal(current.status)) return current;

      await sleep(POLL_INTERVAL_MS);

      const polled = await this.poll(receipt.relayPendingId);
      if (polled !== null) {
        current = { ...receipt, ...polled };
      } else {
        // Relay unreachable — continue polling until deadline.
      }
    }

    // Max wait exceeded.
    return {
      ...current,
      status: "expired",
      error:  `proposal was not ratified within ${MAX_WAIT_MS / 60_000} minutes`,
    };
  }

  /**
   * Single non-blocking query to the relay for a pending proposal's status.
   * Returns null when the relay is unreachable (caller decides how to handle).
   */
  async poll(relayPendingId: string): Promise<Partial<ProposalReceipt> | null> {
    if (!SAFE_PENDING_ID_RE.test(relayPendingId)) return null;

    const ctl = new AbortController();
    const tid = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);

    try {
      const res = await fetch(
        // Encode the ID for URL safety — only alphanumeric/-/_ allowed by guard above.
        `${RELAY_URL}/relay/evolution/status/${encodeURIComponent(relayPendingId)}`,
        {
          signal:  ctl.signal,
          headers: { Accept: "application/json" },
        },
      );
      clearTimeout(tid);

      if (!res.ok) return null;

      const raw = (await res.json()) as unknown;
      if (typeof raw !== "object" || raw === null) return null;

      const m = raw as Record<string, unknown>;
      const status = extractStatus(m["status"] ?? m["state"]);
      if (!status) return null;

      return {
        status,
        error: typeof m["error"] === "string" ? m["error"] : undefined,
      };
    } catch {
      clearTimeout(tid);
      return null;
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TERMINAL_STATUSES = new Set<ProposalStatus>([
  "approved", "rejected", "expired",
]);

function isTerminal(status: ProposalStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

const VALID_STATUSES: Set<string> = new Set<ProposalStatus>([
  "pending_ratification",
  "under_review",
  "approved",
  "rejected",
  "expired",
]);

function extractStatus(raw: unknown): ProposalStatus | null {
  if (typeof raw === "string" && VALID_STATUSES.has(raw)) {
    return raw as ProposalStatus;
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
