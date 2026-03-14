/**
 * Governance Manager
 *
 * Polls the GhostChain governance bridge for pending on-chain proposals
 * and generates governance_execute signals when quorum has been reached.
 *
 * All execution signals require human ratification — the governor never
 * calls executeProposal autonomously.
 *
 * Data source: GOVERNANCE_BRIDGE_URL (default http://127.0.0.1:7685)
 * Falls back gracefully when the bridge is unavailable.
 */
import { randomUUID } from "node:crypto";
import type { GovernorProposal } from "../types.js";

const GOVERNANCE_BRIDGE_URL =
  process.env.GOVERNANCE_BRIDGE_URL ?? "http://127.0.0.1:7685";

// ---------------------------------------------------------------------------
// Bridge response shapes
// ---------------------------------------------------------------------------

interface PendingProposal {
  id: string;
  title?: string;
  description?: string;
  votes: number;      // total votes cast (weighted)
  threshold: number;  // quorum threshold required for execution
  state: string;      // "Pending" | "Active" | "Succeeded" | "Executed" | "Defeated"
  eta?: number;       // UNIX timestamp after which execution is possible
}

interface PendingProposalsResponse {
  proposals: PendingProposal[];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function processGovernance(): Promise<GovernorProposal[]> {
  const proposals: GovernorProposal[] = [];
  const now = Date.now();

  let pending: PendingProposal[] = [];

  try {
    const resp = await fetch(`${GOVERNANCE_BRIDGE_URL}/api/v1/proposals/pending`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (resp.ok) {
      const data  = await resp.json() as PendingProposalsResponse;
      pending     = data.proposals ?? [];
    }
  } catch {
    // Bridge unavailable — skip governance processing this cycle
    return [];
  }

  for (const p of pending) {
    if (p.votes >= p.threshold && p.state === "Succeeded") {
      proposals.push({
        id:          randomUUID(),
        type:        "governance_execute",
        description: `On-chain proposal ${p.id} ("${p.title ?? "untitled"}") has reached quorum (${p.votes} / ${p.threshold} votes). Propose executing after timelock expiry.`,
        params: {
          proposalId:  p.id,
          title:       p.title,
          description: p.description,
          votes:       p.votes,
          threshold:   p.threshold,
          eta:         p.eta,
          state:       p.state,
        },
        timestamp:            now,
        risk:                 "medium",
        requiresRatification: true,
        autoExecute:          false,
      });
    }
  }

  return proposals;
}
