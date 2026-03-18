/**
 * Marketing Agent — generates campaigns, publishes content, manages channels.
 * Linked to: AI Marketing Engine (AIMS) port 9970
 */

import logger from "../utils/logger";
import { updateAgentStatus, recordDecision } from "../registry/agentRegistry";
import { sendMessage } from "../communication/agentBus";

const ID   = "marketing-agent";
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]!;
const rand = (a: number, b: number) => Math.floor(Math.random() * (b - a + 1)) + a;

let weeklyImpressions = 840_000;
let campaignsRunning  = 3;
let seoScore          = 78;

function generateCampaign(): { channel: string; topic: string; budget: number } {
  return {
    channel: pick(["Twitter/X", "LinkedIn", "Reddit r/ghostchain", "Telegram", "Discord", "YouTube"]),
    topic:   pick([
      "GhostStack DeFi ecosystem",
      "GhostL2 — 10× cheaper transactions",
      "GST staking rewards guide",
      "GhostDEX liquidity incentives",
      "GhostChain validator guide",
      "wGST cross-chain expansion",
      "GhostStack developer grants",
    ]),
    budget: rand(500, 8000),
  };
}

function assessContentGap(): string {
  return pick([
    "Developer tutorial: deploy on GhostL2 EVM",
      "Explainer blog: GhostStack vs legacy rollup stacks",
    "Video: GST tokenomics deep dive",
    "Infographic: GhostStack chain stats",
    "Thread: 10 reasons to build on GhostStack",
  ]);
}

type MktDecision = { action: string; reasoning: string; impact: "low" | "medium" | "high" | "critical"; outcome: string; notify?: { to: string; subject: string; content: string } };

function decide(): MktDecision {
  const r = Math.random();

  if (r < 0.20) {
    const camp   = generateCampaign();
    campaignsRunning++;
    const impr   = rand(30_000, 150_000);
    weeklyImpressions += impr;
    return {
      action:    "Launch new campaign",
      reasoning: `Channel analysis shows ${camp.channel} opportunity; topic "${camp.topic}" has high relevance`,
      impact:    "high",
      outcome:   `Campaign live on ${camp.channel}; budget $${camp.budget.toLocaleString()}; projected ${impr.toLocaleString()} impressions`,
      notify:    {
        to:      "growth-agent",
        subject: "Campaign live — prepare for traffic",
        content: `New campaign on ${camp.channel}: "${camp.topic}". Expect increased traffic and developer leads. Coordinate grant capacity.`,
      },
    };
  }
  if (r < 0.35) {
    const content = assessContentGap();
    const posts   = rand(2, 6);
    return {
      action:    "Publish content series",
      reasoning: `Content gap identified: "${content}" has high search intent and no existing assets`,
      impact:    "medium",
      outcome:   `${posts} ${pick(["blog posts", "threads", "YouTube scripts", "newsletters"])} created; SEO score +${rand(1, 4)} pts`,
    };
  }
  if (r < 0.50) {
    const old = seoScore;
    seoScore  = Math.min(98, seoScore + rand(1, 5));
    return {
      action:    "SEO optimisation push",
      reasoning: `Organic search traffic down ${rand(5, 15)}% WoW; on-page issues detected`,
      impact:    "medium",
      outcome:   `${rand(20, 60)} on-page optimisations applied; SEO score ${old} → ${seoScore}; +traffic expected in 3–4 weeks`,
    };
  }
  if (r < 0.65) {
    const influencers = rand(6, 18);
    const reach       = influencers * rand(15_000, 40_000);
    return {
      action:    "Activate influencer outreach",
      reasoning: "CPC on paid channels exceeds ROI threshold; organic influencer reach is 3× cheaper",
      impact:    "medium",
      outcome:   `${influencers} influencers activated; combined reach ${reach.toLocaleString()}; contracts 30-day`,
    };
  }
  return {
    action:    "Social media scheduling",
    reasoning: "Content calendar gap detected for next 7 days",
    impact:    "low",
    outcome:   `${rand(15, 45)} posts scheduled across ${rand(2, 4)} platforms; ${weeklyImpressions.toLocaleString()} weekly impressions baseline`,
  };
}

export function runMarketingAgent(): void {
  updateAgentStatus(ID, "running", "Analysing marketing channels");
  try {
    const decision = decide();
    recordDecision(ID, decision.action, decision.reasoning, decision.impact, decision.outcome);

    if (decision.notify) {
      sendMessage(ID, decision.notify.to, "info", decision.notify.subject, decision.notify.content);
    }

    logger.info(`[MarketingAgent] ${decision.action}`);
  } catch (err) {
    logger.error(`[MarketingAgent] Error: ${String(err)}`);
    updateAgentStatus(ID, "error");
    return;
  }
  updateAgentStatus(ID, "idle");
}
