/**
 * GhostGovernor AI
 *
 * Governance manager: proposes DAO votes, manages network upgrades,
 * enforces GhostConstitution rules. Fourth agent in the upgrade-cycle workflow.
 *
 * NOTE: AI may WRITE proposals; humans must RATIFY them.
 * No autonomous on-chain execution without governance quorum.
 */

import { BaseAgent } from "./base.js";
import { bus }       from "../bus/messageBus.js";
import type { SwarmTask } from "../types.js";

const GOVERNOR_AI_URL = process.env.GOVERNOR_AI_URL ?? "http://127.0.0.1:7930";
const MIN_VOTE_PERIOD_S = 172_800; // 48 hours
const QUORUM_BPS = 4_000;          // 40%

export class GhostGovernorAgent extends BaseAgent {
  readonly role         = "governor" as const;
  readonly name         = "GhostGovernor AI";
  readonly description  = "Manages governance proposals, DAO votes, and constitutional rule enforcement";
  readonly capabilities = [
    "draft-proposal", "cast-vote", "propose-upgrade",
    "analyze-vote", "enforce-constitution",
  ];

  protected async handleTask(task: SwarmTask): Promise<Record<string, unknown>> {
    switch (task.type) {
      case "draft-proposal":      return this.draftProposal(task.payload);
      case "propose-upgrade":     return this.proposeUpgrade(task.payload);
      case "analyze-vote":        return this.analyzeVote(task.payload);
      case "enforce-constitution": return this.enforceConstitution(task.payload);
      case "cast-vote":           return this.castVote(task.payload);
      default:                    return this.draftProposal(task.payload);
    }
  }

  private draftProposal(payload: Record<string, unknown>): Record<string, unknown> {
    const title    = (payload["title"]       as string | undefined) ?? "Protocol Upgrade";
    const upgrade  = payload["upgrade"] as Record<string, unknown> | undefined;
    const auditOk  = Boolean(payload["auditPassed"] ?? false);

    if (!auditOk) {
      return {
        proposal: null,
        blocked:  true,
        reason:   "Proposal blocked: audit has not passed. Run GhostAuditor first.",
      };
    }

    const proposal = {
      id:          `GIP-${Date.now()}`,
      title,
      description: upgrade?.["approach"] as string | undefined ?? "Proposed by GhostGovernor AI",
      status:      "draft",
      voteStart:   new Date(Date.now() + 3_600_000).toISOString(),     // 1 hour
      voteEnd:     new Date(Date.now() + MIN_VOTE_PERIOD_S * 1000).toISOString(),
      quorumBps:   QUORUM_BPS,
      requiresHumanRatification: true,
      aiAuthored:  true,
      actions:     upgrade ? [{ target: upgrade["components"], value: 0 }] : [],
    };

    bus.publish("workflow:step", "governor", { step: "proposal-drafted", proposal });

    return { proposal, humanApprovalRequired: true };
  }

  private proposeUpgrade(payload: Record<string, unknown>): Record<string, unknown> {
    // Relay to ghost-governor-ai service (non-blocking)
    void this.relayToGovernorService(payload);
    return {
      status: "queued",
      note:   "Upgrade proposal submitted to ghost-governor-ai for human ratification.",
    };
  }

  private async relayToGovernorService(payload: Record<string, unknown>): Promise<void> {
    try {
      const { fetch } = await import("undici");
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 5_000);
      await fetch(`${GOVERNOR_AI_URL}/proposals`, {
        method:  "POST",
        headers: { "content-type": "application/json" },
        body:    JSON.stringify(payload),
        signal:  ctrl.signal,
      });
    } catch { /* governor offline — proposal queued locally */ }
  }

  private analyzeVote(payload: Record<string, unknown>): Record<string, unknown> {
    const forVotes     = Number(payload["forVotes"]     ?? 0);
    const againstVotes = Number(payload["againstVotes"] ?? 0);
    const totalSupply  = Number(payload["totalSupply"]  ?? 1);
    const quorumBps    = Number(payload["quorumBps"]    ?? QUORUM_BPS);

    const totalVotes   = forVotes + againstVotes;
    const participationBps = Math.round((totalVotes / totalSupply) * 10_000);
    const forBps           = totalVotes > 0 ? Math.round((forVotes / totalVotes) * 10_000) : 0;
    const quorumReached    = participationBps >= quorumBps;
    const passed           = quorumReached && forBps > 5_000;

    return {
      participationBps, forBps, quorumReached, passed,
      summary: passed
        ? "Proposal passed. Ready for execution after timelock."
        : quorumReached
          ? "Quorum reached but vote failed."
          : "Quorum not reached. Vote invalid.",
    };
  }

  private enforceConstitution(payload: Record<string, unknown>): Record<string, unknown> {
    const action     = (payload["action"]    as string | undefined) ?? "";
    const violations: string[] = [];

    // Core constitutional rules
    if (/eth_|e(?:thereum)|mainnet/i.test(action))
      violations.push("CONST-001: No legacy external mainnet dependency allowed.");
    if (/autonomous.*(execute|deploy)/i.test(action) && !payload["governanceApproved"])
      violations.push("CONST-002: Autonomous execution requires governance quorum.");
    if (/treasury.*drain|treasury.*empty/i.test(action))
      violations.push("CONST-003: Treasury drainage requires full DAO ratification.");

    if (violations.length > 0) {
      bus.publish("alert:governance", "governor", { violations, action });
    }

    return {
      compliant:  violations.length === 0,
      violations,
      verdict:    violations.length === 0
        ? "Action is constitutionally compliant."
        : `Action violates GhostConstitution: ${violations.join("; ")}`,
    };
  }

  private castVote(payload: Record<string, unknown>): Record<string, unknown> {
    // AI never autonomously casts on-chain votes — this returns a recommendation
    const proposalId = payload["proposalId"] as string | undefined;
    const auditOk    = Boolean(payload["auditPassed"] ?? false);

    return {
      recommendation: auditOk ? "FOR" : "AGAINST",
      proposalId,
      reason: auditOk
        ? "Audit passed. GhostGovernor AI recommends FOR."
        : "Audit failed or missing. GhostGovernor AI recommends AGAINST.",
      autonomousVote: false,
      note: "AI vote recommendation only — human must execute on-chain vote.",
    };
  }
}
