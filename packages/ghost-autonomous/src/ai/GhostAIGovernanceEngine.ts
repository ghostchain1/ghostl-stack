import { Logger } from "@ghostchain/devkit";

const log = Logger.create("AIGovernanceEngine");

export interface GovernanceMetrics {
  gasPrice?: bigint;
  blockTime?: number;
  peerCount?: number;
  cpuPercent?: number;
  memPercent?: number;
  txRate?: number;
  [key: string]: unknown;
}

export interface GovernanceProposal {
  id: string;
  title: string;
  description: string;
  action: string;
  params: Record<string, unknown>;
  urgency: "low" | "medium" | "high";
  generatedAt: string;
}

export class GhostAIGovernanceEngine {
  generate(metrics: GovernanceMetrics): GovernanceProposal[] {
    const proposals: GovernanceProposal[] = [];

    // Gas price spike — propose limit
    if (metrics.gasPrice !== undefined && metrics.gasPrice > 200_000_000_000n) {
      proposals.push(this.make(
        "gas-limit",
        "Reduce block gas limit",
        "Gas price spike detected. Propose reducing base fee to stabilise.",
        "setBlockGasLimit",
        { newLimit: "20000000" },
        "high",
      ));
    }

    // High CPU — scale compute
    if ((metrics.cpuPercent ?? 0) > 85) {
      proposals.push(this.make(
        "scale-compute",
        "Scale validator compute resources",
        `CPU at ${metrics.cpuPercent}% — trigger horizontal node scale.`,
        "scaleNodes",
        { direction: "up", count: 1 },
        "high",
      ));
    }

    // Low peers — boost boot node list
    if ((metrics.peerCount ?? 10) < 3) {
      proposals.push(this.make(
        "add-bootnodes",
        "Add emergency bootnodes",
        `Peer count critically low: ${metrics.peerCount}. Propose adding bootnodes.`,
        "addBootnodes",
        { source: "ghost-bootnode-registry-v1" },
        "high",
      ));
    }

    // High mempool — increase block size
    if ((metrics.txRate ?? 0) > 500) {
      proposals.push(this.make(
        "increase-block",
        "Increase block gas limit for throughput",
        `TX rate: ${metrics.txRate}/s. Propose increasing block capacity.`,
        "setBlockGasLimit",
        { newLimit: "60000000" },
        "medium",
      ));
    }

    log.info(`Generated ${proposals.length} proposal(s) from metrics`);
    return proposals;
  }

  private make(
    id: string,
    title: string,
    description: string,
    action: string,
    params: Record<string, unknown>,
    urgency: "low" | "medium" | "high",
  ): GovernanceProposal {
    return { id, title, description, action, params, urgency, generatedAt: new Date().toISOString() };
  }
}
