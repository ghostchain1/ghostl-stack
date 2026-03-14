import { Logger } from "@ghostchain/devkit";
import type { GovernanceMetrics, GovernanceProposal } from "../ai/GhostAIGovernanceEngine.js";
import { GhostAIGovernanceEngine } from "../ai/GhostAIGovernanceEngine.js";

const log = Logger.create("GovernanceProposalAI");

export class GhostGovernanceProposalAI {
  private readonly engine = new GhostAIGovernanceEngine();

  generateProposal(metrics: GovernanceMetrics): GovernanceProposal[] {
    const proposals = this.engine.generate(metrics);
    log.info(`Generated ${proposals.length} governance proposal(s)`);
    return proposals;
  }

  /** Convenience: generate and return only the highest-urgency proposals. */
  urgent(metrics: GovernanceMetrics): GovernanceProposal[] {
    return this.generateProposal(metrics).filter((p) => p.urgency === "high");
  }
}
