/**
 * Growth Agent — developer recruitment, dApp onboarding, grant distribution.
 * Linked to: Viral Growth Engine (VGE) port 9971
 */

import logger from "../utils/logger";
import { updateAgentStatus, recordDecision } from "../registry/agentRegistry";
import { sendMessage } from "../communication/agentBus";

const ID   = "growth-agent";
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]!;
const rand = (a: number, b: number) => Math.floor(Math.random() * (b - a + 1)) + a;

let totalDevs       = 2840;
let totalDapps      = 37;
let grantsDistributed = 480_000;
let weeklySignups   = 140;

function scanGrowthOpportunities(): string[] {
  const opportunities: string[] = [];
  if (Math.random() < 0.4) opportunities.push("github-outreach");
  if (Math.random() < 0.3) opportunities.push("grant-approval");
  if (Math.random() < 0.2) opportunities.push("dapp-onboarding");
  if (Math.random() < 0.3) opportunities.push("referral-campaign");
  if (opportunities.length === 0) opportunities.push("ecosystem-report");
  return opportunities;
}

type GrowthDecision = { action: string; reasoning: string; impact: "low" | "medium" | "high" | "critical"; outcome: string; notify?: { to: string; subject: string; content: string } };

function decide(opportunities: string[]): GrowthDecision {
  const opp = opportunities[0]!;

  if (opp === "grant-approval") {
    const count    = rand(1, 4);
    const total    = count * rand(10_000, 25_000);
    grantsDistributed += total;
    return {
      action:    `Approve ${count} developer grant${count > 1 ? "s" : ""}`,
      reasoning: `${count} application${count > 1 ? "s" : ""} scored > 82/100 by AI review committee`,
      impact:    "high",
      outcome:   `$${total.toLocaleString()} disbursed; builders committing to GhostL2 mainnet; total grants: $${grantsDistributed.toLocaleString()}`,
      notify:    {
        to:      "economy-agent",
        subject: "Grant disbursement executed",
        content: `$${total.toLocaleString()} in developer grants disbursed. Please update treasury report and ensure liquidity is sufficient for coming L2 dApp launches.`,
      },
    };
  }
  if (opp === "dapp-onboarding") {
    const count = rand(1, 3);
    const names = pick(["GhostSwap v2, GhostLend", "GhostBridge UI, GhostNFT", "GhostPay, GhostStake", "PolyGhost", "GhostYield"]);
    totalDapps += count;
    return {
      action:    `Onboard ${count} dApp${count > 1 ? "s" : ""} to GhostL2`,
      reasoning: `${count} project team${count > 1 ? "s" : ""} completed integration review; GhostL2 EVM compatibility confirmed`,
      impact:    "high",
      outcome:   `${names} onboarded; estimated +$${rand(200, 900)}K TVL; total ecosystem dApps: ${totalDapps}`,
    };
  }
  if (opp === "github-outreach") {
    const leads = rand(30, 80);
    const positive = Math.floor(leads * 0.18);
    totalDevs += positive;
    return {
      action:    "Developer outreach campaign",
      reasoning: `GitHub analysis identified ${leads} Solidity / Rust devs with high engagement signals`,
      impact:    "medium",
      outcome:   `${leads} leads contacted; ${positive} positive responses; ${Math.floor(positive * 0.4)} expect to deploy on GhostL2; total devs: ${totalDevs.toLocaleString()}`,
    };
  }
  if (opp === "referral-campaign") {
    const codes = rand(150, 500);
    weeklySignups += Math.floor(codes * 0.18);
    return {
      action:    "Launch / refresh referral program",
      reasoning: "User acquisition cost 2.8× organic threshold; referral channels show 3.1× ROI",
      impact:    "medium",
      outcome:   `${codes} referral codes issued; projected +${Math.floor(codes * 0.18)} new wallets this week`,
    };
  }
  return {
    action:    "Ecosystem transparency report",
    reasoning: "Weekly report due; community trust metric requires consistent publishing",
    impact:    "low",
    outcome:   `Report published: ${totalDevs.toLocaleString()} developers, ${totalDapps} dApps, $${grantsDistributed.toLocaleString()} grants`,
  };
}

export function runGrowthAgent(): void {
  updateAgentStatus(ID, "running", "Scanning growth opportunities");
  try {
    const opportunities = scanGrowthOpportunities();
    const decision      = decide(opportunities);
    recordDecision(ID, decision.action, decision.reasoning, decision.impact, decision.outcome);

    if (decision.notify) {
      sendMessage(ID, decision.notify.to, "info", decision.notify.subject, decision.notify.content);
    }

    logger.info(`[GrowthAgent] ${decision.action}`);
  } catch (err) {
    logger.error(`[GrowthAgent] Error: ${String(err)}`);
    updateAgentStatus(ID, "error");
    return;
  }
  updateAgentStatus(ID, "idle");
}
