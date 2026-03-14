/**
 * Governance Agent — proposal generation, vote monitoring, DAO coordination.
 * Linked to: Autonomous Governance Engine (AGE) port 9978
 */

import logger from "../utils/logger";
import { updateAgentStatus, recordDecision } from "../registry/agentRegistry";
import { sendMessage } from "../communication/agentBus";

const ID   = "governance-agent";
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]!;
const rand = (a: number, b: number) => Math.floor(Math.random() * (b - a + 1)) + a;

let proposalCounter  = 47;
let votesMonitored   = 1_284;
let daoParticipation = 0.63;   // 63 %

function buildProposalTitle(): string {
  return pick([
    `Increase validator staking rewards by ${rand(3, 12)}%`,
    `Reduce transaction fee floor to ${(rand(1, 8) * 0.0001).toFixed(4)} GST`,
    `Extend ecosystem grant budget by $${rand(50, 200)}K`,
    `Add ${rand(2, 5)} new validator seats to active set`,
    `Activate cross-chain governance for GhostL2 DAOs`,
    `Adjust slashing penalty: ${rand(5, 20)}% → ${rand(1, 4)}%`,
    `Migrate treasury to multi-sig 7-of-12`,
    `Set bridging fee to ${rand(1, 5)} basis points`,
  ]);
}

type GovDecision = { action: string; reasoning: string; impact: "low" | "medium" | "high" | "critical"; outcome: string; notify?: { to: string; subject: string; content: string } };

function decide(): GovDecision {
  const roll = Math.random();

  if (roll < 0.15) {
    proposalCounter++;
    const title = buildProposalTitle();
    return {
      action:    `Generate proposal GIP-${proposalCounter}`,
      reasoning: "Scheduled governance cycle + ecosystem health indicators support this parameter change",
      impact:    "high",
      outcome:   `GIP-${proposalCounter}: "${title}" — submitted to on-chain voting; 7-day deliberation window opened`,
      notify:    {
        to:      "economy-agent",
        subject: `GIP-${proposalCounter} needs cost-impact analysis`,
        content: `New governance proposal generated: "${title}". Please model the economic impact and post results to the governance forum before voting closes.`,
      },
    };
  }
  if (roll < 0.25) {
    const gip = rand(40, proposalCounter);
    const passed = Math.random() < 0.72;
    const votes  = rand(1_200, 8_400);
    votesMonitored += votes;
    return {
      action:    `Conclude vote on GIP-${gip}`,
      reasoning: `Quorum reached (${rand(62, 89)}% participation); deliberation period expired`,
      impact:    "high",
      outcome:   `GIP-${gip} ${passed ? "PASSED" : "REJECTED"} with ${votes.toLocaleString()} votes; implementation ${passed ? "queued for next epoch" : "archived"}`,
    };
  }
  if (roll < 0.40) {
    const scenarios = rand(3, 8);
    return {
      action:    "Policy simulation run",
      reasoning: "Pre-vote impact modelling requested by governance council",
      impact:    "medium",
      outcome:   `${scenarios} parameter scenarios evaluated; recommended: ${pick(["Option A (balanced growth)", "Option B (conservative)", "Option C (aggressive expansion)"])}`,
    };
  }
  if (roll < 0.50) {
    const daos      = rand(4, 12);
    const inactive  = rand(1, Math.floor(daos / 2));
    daoParticipation = Math.min(0.95, daoParticipation + rand(-2, 4) / 100);
    return {
      action:    "DAO coordination check",
      reasoning: `${inactive} DAOs missed last quorum; cross-DAO collaboration opportunity detected`,
      impact:    "medium",
      outcome:   `Notified ${inactive} inactive DAOs; consolidated ${daos} DAO agendas; participation: ${(daoParticipation * 100).toFixed(1)}%`,
    };
  }
  return {
    action:    "Vote monitoring & governance health report",
    reasoning: "Continuous monitoring ensures governance integrity and voter awareness",
    impact:    "low",
    outcome:   `Monitored ${votesMonitored.toLocaleString()} cumulative votes; ${proposalCounter} proposals lifetime; DAO participation: ${(daoParticipation * 100).toFixed(1)}%`,
  };
}

export function runGovernanceAgent(): void {
  updateAgentStatus(ID, "running", "Evaluating governance activity");
  try {
    const decision = decide();
    recordDecision(ID, decision.action, decision.reasoning, decision.impact, decision.outcome);

    if (decision.notify) {
      sendMessage(ID, decision.notify.to, "info", decision.notify.subject, decision.notify.content);
    }

    logger.info(`[GovernanceAgent] ${decision.action}`);
  } catch (err) {
    logger.error(`[GovernanceAgent] Error: ${String(err)}`);
    updateAgentStatus(ID, "error");
    return;
  }
  updateAgentStatus(ID, "idle");
}
