/**
 * Architect Agent — designs system architecture, proposes protocol upgrades,
 * plans chain expansions, and coordinates technical strategy across layers.
 */

import logger from "../utils/logger";
import { updateAgentStatus, recordDecision } from "../registry/agentRegistry";
import { sendMessage } from "../communication/agentBus";

const ID   = "architect-agent";
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]!;
const rand = (a: number, b: number) => Math.floor(Math.random() * (b - a + 1)) + a;

type ArchDecision = {
  action:    string;
  reasoning: string;
  impact:    "low" | "medium" | "high" | "critical";
  outcome:   string;
  notify?:   { to: string; subject: string; content: string };
};

let proposalCount      = 12;
let upgradesDeployed   = 7;
let researchItems      = 3;

function assessSystemState(): "stable" | "needs-upgrade" | "needs-scaling" | "needs-research" {
  const r = Math.random();
  if      (r < 0.15) return "needs-upgrade";
  else if (r < 0.30) return "needs-scaling";
  else if (r < 0.45) return "needs-research";
  else               return "stable";
}

function decide(state: ReturnType<typeof assessSystemState>): ArchDecision {
  if (state === "needs-upgrade") {
    const version = `v2.${rand(1, 9)}.${rand(0, 9)}`;
    upgradesDeployed++;
    return {
      action: pick([
        "Propose protocol upgrade",
        "Submit EIP-compatible proposal",
        "Draft consensus layer improvement",
        "Design bridge contract v2",
      ]),
      reasoning: pick([
        "Transaction throughput hitting theoretical max at peak load",
        "EVM opcode gas costs misaligned with current compute costs",
        "Cross-chain message format needs standardisation for interop",
        "Beacon chain fork compatibility requires preemptive upgrade",
      ]),
      impact:  "high",
      outcome: `Protocol upgrade ${version} drafted; estimated 12% throughput improvement; ready for governance vote`,
      notify: {
        to:      "governance-agent",
        subject: `Architecture proposal for ${version}`,
        content: `Protocol upgrade ${version} has been designed. Simulated improvement: +12% throughput, -8% avg gas. Recommending governance proposal submission.`,
      },
    };
  }

  if (state === "needs-scaling") {
    const layer = pick(["L2", "L3", "L4"]);
    return {
      action: pick([
        `Design ${layer} scaling blueprint`,
        "Architect rollup compression layer",
        "Plan DA layer integration",
        "Design validator sharding scheme",
      ]),
      reasoning: pick([
        "Current single-chain throughput insufficient for projected Q3 growth",
        "L2 sequencer batch size sub-optimal; restructuring DA pipeline",
        "Validator set growth requires sharding to preserve decentralisation",
        "ZK-rollup proof aggregation can reduce L1 settlement cost by 40%",
      ]),
      impact:  "high",
      outcome: `${layer} scaling architecture drafted; sharding design reduces node requirements by ${rand(15, 35)}%; proposal ready`,
    };
  }

  if (state === "needs-research") {
    researchItems++;
    return {
      action: pick([
        "Initiate ZK-proof research track",
        "Evaluate post-quantum cryptography",
        "Analyse competing protocol architectures",
        "Research DA sampling techniques",
      ]),
      reasoning: pick([
        "Competitor chains adopting ZK-EVMs; long-term competitiveness requires proactive research",
        "NIST post-quantum standards finalised; migration planning needed",
        "BLS aggregate signature scheme may reduce block size by 30%",
        "Light client protocol needed for mobile validator support",
      ]),
      impact:  "medium",
      outcome: `Research task ${researchItems} initiated; estimated 6-week timeline; findings to inform roadmap Q${rand(2, 4)}`,
    };
  }

  // stable — audit and log
  proposalCount++;
  return {
    action: pick([
      "Architectural review completed",
      "System coherence audit passed",
      "Cross-layer dependency map updated",
      "Component compatibility matrix refreshed",
    ]),
    reasoning: pick([
      "Scheduled monthly architectural audit",
      "No critical design debt detected; minor documentation updates",
      "All L1/L2/L3 interfaces validated against current spec",
      "Dependency graph stabilised after last upgrade cycle",
    ]),
    impact:  "low",
    outcome: `Architecture audit complete; ${proposalCount} active proposals tracked; no blocking issues found`,
  };
}

export function runArchitectAgent(): void {
  updateAgentStatus(ID, "running", "Assessing system architecture and planning upgrades");
  try {
    const state    = assessSystemState();
    const decision = decide(state);

    recordDecision(ID, decision.action, decision.reasoning, decision.impact, decision.outcome);

    if (decision.notify) {
      sendMessage(ID, decision.notify.to, "command", decision.notify.subject, decision.notify.content);
    }

    logger.info(`[ArchitectAgent] ${decision.action} (${decision.impact})`);
  } catch (err) {
    logger.error(`[ArchitectAgent] Error: ${err}`);
    updateAgentStatus(ID, "error");
    return;
  }
  updateAgentStatus(ID, "idle");
}
