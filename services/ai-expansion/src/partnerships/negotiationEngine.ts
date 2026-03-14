/**
 * NegotiationEngine — generates AI-powered partnership proposals and tracks deal lifecycle.
 */

import OpenAI from "openai";
import { Partner, PARTNERS } from "./partnershipDiscovery";
import logger from "../utils/logger";

let openai: OpenAI | null = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export interface Deal {
  partnerId:   string;
  partnerName: string;
  proposal:    string;
  status:      "draft" | "sent" | "negotiating" | "agreed" | "rejected";
  createdAt:   string;
  updatedAt:   string;
}

const deals: Deal[] = [];

async function generateProposal(partner: Partner): Promise<string> {
  if (openai) {
    try {
      const res = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You write concise, professional Web3 partnership proposals (2 paragraphs max)." },
          { role: "user",   content: `Write a partnership proposal from GhostChain to ${partner.name} (${partner.category}). Focus: ${partner.notes}. Highlight GhostChain's multi-layer architecture (L1/L2/L3), GST token economics, and mutual growth opportunity.` },
        ],
        max_tokens: 300, temperature: 0.7,
      });
      return res.choices[0]?.message?.content?.trim() ?? fallbackProposal(partner);
    } catch {
      return fallbackProposal(partner);
    }
  }
  return fallbackProposal(partner);
}

function fallbackProposal(partner: Partner): string {
  return `Dear ${partner.name} team,

GhostChain is a high-performance multi-layer blockchain (L1/L2/L3) delivering sub-second finality and near-zero fees. We believe a strategic partnership between GhostChain and ${partner.name} would create significant value: ${partner.notes}.

We propose a formal integration agreement including co-marketing, technical support, and revenue sharing. With our growing GST ecosystem and 10,000+ daily active users, this partnership aligns with both teams' growth objectives. Looking forward to your response.`;
}

export async function proposePartnership(partner: Partner): Promise<Deal> {
  const existing = deals.find(d => d.partnerId === partner.id && d.status !== "rejected");
  if (existing) {
    logger.info(`NegotiationEngine: already have active deal with ${partner.name}`);
    return existing;
  }

  const proposal = await generateProposal(partner);
  const deal: Deal = {
    partnerId:   partner.id,
    partnerName: partner.name,
    proposal,
    status:      "draft",
    createdAt:   new Date().toISOString(),
    updatedAt:   new Date().toISOString(),
  };

  deals.push(deal);
  partner.status = "proposed";
  logger.info(`NegotiationEngine: proposal drafted for ${partner.name}`);
  return deal;
}

export async function runNegotiationCycle(limit = 3): Promise<Deal[]> {
  const targets = PARTNERS
    .filter(p => p.status === "identified" && p.relevance >= 80)
    .slice(0, limit);

  const results: Deal[] = [];
  for (const p of targets) {
    const deal = await proposePartnership(p);
    results.push(deal);
  }
  logger.info(`NegotiationEngine: cycle complete — ${results.length} proposals drafted`);
  return results;
}

export function getDeals(): Deal[] { return deals; }
