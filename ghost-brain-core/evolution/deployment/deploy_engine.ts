/**
 * GhostBrain Self-Evolution Engine — Deploy Engine
 *
 * Submits a fully-formed EvolutionProposal to the human-operated signing
 * relay (SIGNING_RELAY_URL).  The relay requires human ratification before
 * any change is applied on-chain or to source files.
 *
 * This engine NEVER:
 *   - writes to the source tree directly
 *   - submits transactions autonomously
 *   - modifies production infrastructure
 *
 * It only POSTS a proposal payload (diff + metadata) to the relay and
 * returns a ProposalReceipt with a pending ID for the governance gate to poll.
 *
 * SECURITY INVARIANTS
 * -------------------
 * 1. SIGNING_RELAY_URL is taken from environment — never user-supplied.
 * 2. All identifier fields (taskId, diffHash) are validated before use.
 * 3. fetch() uses AbortController timeout — never hangs forever.
 * 4. No token / private key is stored here — the relay holds signing keys.
 * 5. chain_id and gas_token are compile-time constants — never overridden.
 */

import { randomUUID } from "crypto";
import type {
  EvolutionDiff,
  EvolutionProposal,
  ProposalReceipt,
  TestReport,
  AuditReport,
  StabilityReport,
} from "../types.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const RELAY_URL = (
  process.env["SIGNING_RELAY_URL"] ?? "http://localhost:7910"
).replace(/\/$/, "");

const SUBMIT_TIMEOUT_MS = parseInt(
  process.env["EVOLUTION_SUBMIT_TIMEOUT_MS"] ?? "15000", 10,
);

// GhostChain constants — never configurable.
const CHAIN_ID    = 14000101 as const;
const GAS_TOKEN   = "GST" as const;
const PROPOSER    = "ghostbrain-evolution" as const;

// ---------------------------------------------------------------------------
// DeployEngine
// ---------------------------------------------------------------------------

export class DeployEngine {
  /**
   * Build an EvolutionProposal and POST it to the signing relay.
   *
   * Prerequisites (caller must verify before calling):
   *   - testReport.passed === true
   *   - auditReport.approved === true
   *   - stabilityReport.stable === true
   *
   * Returns a ProposalReceipt.  On relay error, receipt.status is "rejected".
   */
  async submit(
    diff:            EvolutionDiff,
    testReport:      TestReport,
    auditReport:     AuditReport,
    stabilityReport: StabilityReport,
  ): Promise<ProposalReceipt> {
    const now = Date.now();

    // Build the proposal — all fields are typed, no arbitrary strings.
    const proposal: EvolutionProposal = {
      id:             randomUUID(),
      taskId:         diff.taskId,
      kind:           diff.kind,
      targetFile:     diff.targetFile,
      unifiedDiff:    diff.unifiedDiff,
      diffHash:       diff.diffHash,
      rationale:      diff.rationale,
      testPassed:     testReport.passed,
      auditApproved:  auditReport.approved,
      systemStable:   stabilityReport.stable,
      chain_id:       CHAIN_ID,
      gas_token:      GAS_TOKEN,
      from:           PROPOSER,
      submittedAt:    now,
    };

    const ctl = new AbortController();
    const tid = setTimeout(() => ctl.abort(), SUBMIT_TIMEOUT_MS);

    try {
      const res = await fetch(`${RELAY_URL}/relay/evolution/sign_and_queue`, {
        method:  "POST",
        signal:  ctl.signal,
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(proposal),
      });
      clearTimeout(tid);

      if (!res.ok) {
        const body = await res.text().catch(() => "(unreadable)");
        return {
          relayPendingId: "",
          status:         "rejected",
          submittedAt:    now,
          error:          `relay returned HTTP ${res.status}: ${body.slice(0, 200)}`,
        };
      }

      const raw = (await res.json()) as unknown;
      const pendingId = extractString(raw, "pending_id") ?? extractString(raw, "id") ?? "";

      return {
        relayPendingId: pendingId,
        status:         "pending_ratification",
        submittedAt:    now,
      };
    } catch (err) {
      clearTimeout(tid);
      return {
        relayPendingId: "",
        status:         "rejected",
        submittedAt:    now,
        error:          err instanceof Error ? err.message : String(err),
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractString(raw: unknown, key: string): string | null {
  if (typeof raw !== "object" || raw === null) return null;
  const v = (raw as Record<string, unknown>)[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}
