/**
 * Proposal Executor
 *
 * Constructs unsigned governance proposals and forwards them to the
 * human-operated signing relay. NEVER submits transactions autonomously.
 *
 * Flow:
 *   GhostBrain constructs calldata
 *     → POST to SIGNING_RELAY_URL/relay/sign_and_submit
 *     → Relay presents to human operator
 *     → Human approves / rejects
 *     → On-chain execution via GhostChainGovernor quorum + timelock
 *
 * Security:
 *   - No private keys here.
 *   - Relay enforces gasToken:"GST" and chain_id:14000101.
 *   - This module is read/propose only.
 */

import type { MetricsSnapshot } from "../brain/decision_engine.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SupervisorProposal {
  type:        "infrastructure_alert" | "scale_request" | "vm_recovery" | "network_alert";
  description: string;
  metrics:     Partial<MetricsSnapshot>;
  timestamp:   number;
  chain_id:    14000101;
  gas_token:   "GST";
  /** Forwarded to relay for attribution only — relay resolves actual signer. */
  from:        "ghostbrain-supervisor";
}

export interface ProposalReceipt {
  relayPendingId: string;
  submittedAt:    number;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SIGNING_RELAY_URL =
  process.env["SIGNING_RELAY_URL"] ?? "http://localhost:7910";

// ---------------------------------------------------------------------------
// ProposalExecutor
// ---------------------------------------------------------------------------

export class ProposalExecutor {
  /**
   * Submit an infrastructure alert as an unsigned governance proposal.
   * The signing relay presents this to a human operator for ratification.
   */
  async submitAlert(
    reason:  string,
    metrics: MetricsSnapshot,
  ): Promise<ProposalReceipt> {
    const proposal: SupervisorProposal = {
      type:        "infrastructure_alert",
      description: reason,
      metrics: {
        cpuLoad:             metrics.cpuLoad,
        memoryUsedPct:       metrics.memoryUsedPct,
        unhealthyContainers: metrics.unhealthyContainers,
        offlineVMs:          metrics.offlineVMs,
        l2BlockLag:          metrics.l2BlockLag,
        riskScore:           metrics.riskScore,
      },
      timestamp: Date.now(),
      chain_id:  14000101,
      gas_token: "GST",
      from:      "ghostbrain-supervisor",
    };

    return this.post(proposal);
  }

  /**
   * Submit a scale-up request for human approval.
   */
  async submitScaleRequest(
    reason:  string,
    metrics: MetricsSnapshot,
  ): Promise<ProposalReceipt> {
    const proposal: SupervisorProposal = {
      type:        "scale_request",
      description: reason,
      metrics:     { cpuLoad: metrics.cpuLoad, memoryUsedPct: metrics.memoryUsedPct },
      timestamp:   Date.now(),
      chain_id:    14000101,
      gas_token:   "GST",
      from:        "ghostbrain-supervisor",
    };

    return this.post(proposal);
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private async post(proposal: SupervisorProposal): Promise<ProposalReceipt> {
    console.log(
      `[ProposalExecutor] Forwarding "${proposal.type}" to signing relay: ${proposal.description}`
    );

    const res = await fetch(`${SIGNING_RELAY_URL}/relay/sign_and_submit`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      signal:  AbortSignal.timeout(15_000),
      body:    JSON.stringify(proposal),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "(unreadable)");
      throw new Error(`Signing relay returned HTTP ${res.status}: ${text}`);
    }

    const body = await res.json() as { pending_id?: string };
    const receipt: ProposalReceipt = {
      relayPendingId: body.pending_id ?? "unknown",
      submittedAt:    Date.now(),
    };

    console.log(
      `[ProposalExecutor] Proposal submitted — relay pending id: ${receipt.relayPendingId}`
    );

    return receipt;
  }
}
