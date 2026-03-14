import { Logger } from "@ghostchain/devkit";
import type { GovernanceProposal } from "../ai/GhostAIGovernanceEngine.js";

const log = Logger.create("ProposalSimulator");

export interface SimulationResult {
  proposalId: string;
  impact: "low" | "medium" | "high";
  risk: "low" | "medium" | "high";
  recommendation: "approve" | "reject" | "review";
  notes: string[];
}

const IMPACT_MAP: Record<string, "low" | "medium" | "high"> = {
  setBlockGasLimit: "high",
  scaleNodes:       "medium",
  addBootnodes:     "low",
};

const RISK_MAP: Record<string, "low" | "medium" | "high"> = {
  setBlockGasLimit: "high",
  scaleNodes:       "medium",
  addBootnodes:     "low",
};

export class GhostProposalSimulator {
  simulate(proposal: GovernanceProposal): SimulationResult {
    const impact = IMPACT_MAP[proposal.action] ?? "medium";
    const risk   = RISK_MAP[proposal.action]   ?? "medium";

    const notes: string[] = [];
    if (impact === "high") notes.push("High-impact action — requires multi-sig approval");
    if (risk   === "high") notes.push("High-risk — simulate on testnet first");
    if (proposal.urgency === "high") notes.push("Urgent — time-sensitive proposal");

    const recommendation: SimulationResult["recommendation"] =
      risk === "high" ? "review" :
      impact === "high" ? "review" :
      "approve";

    log.info(`Simulated "${proposal.title}": impact=${impact} risk=${risk} → ${recommendation}`);
    return { proposalId: proposal.id, impact, risk, recommendation, notes };
  }

  simulateAll(proposals: GovernanceProposal[]): SimulationResult[] {
    return proposals.map((p) => this.simulate(p));
  }
}
