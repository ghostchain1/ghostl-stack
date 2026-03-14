/**
 * InfluencerDeals — automates proposal generation and deal tracking.
 */

import { discoverInfluencers, Influencer } from "./influencerDiscovery";
import OpenAI from "openai";
import logger from "../utils/logger";

let openai: OpenAI | null = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export interface Deal {
  influencerId: string;
  influencerName: string;
  platform:     string;
  proposal:     string;
  compensation: string; // GST amount
  status:       "proposed" | "negotiating" | "accepted" | "rejected";
  proposedAt:   string;
}

const deals: Deal[] = [];

async function generateProposal(inf: Influencer): Promise<string> {
  const gstCompensation = Math.round(inf.followers / 1000) * 10;

  if (openai) {
    try {
      const comp = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You write concise, professional blockchain influencer partnership proposals." },
          { role: "user", content: `Write a partnership proposal for ${inf.name} (${inf.followers.toLocaleString()} ${inf.platform} followers). Offer ${gstCompensation.toLocaleString()} GST tokens. Focus on GhostChain's growth potential. Max 150 words.` },
        ],
        max_tokens: 200,
        temperature: 0.75,
      });
      return comp.choices[0]?.message?.content?.trim() ?? fallback(inf, gstCompensation);
    } catch { /* fall through */ }
  }
  return fallback(inf, gstCompensation);
}

function fallback(inf: Influencer, gst: number): string {
  return `Hi ${inf.name},

GhostChain is a next-gen multi-layer blockchain (L1+L2+L3) and we'd love to partner with you on ${inf.platform}.

We're offering ${gst.toLocaleString()} GST tokens for a sponsored post or video feature. GST is our native deflationary gas token with staking rewards.

GhostChain offers unmatched speed, near-zero fees, and a growing DeFi ecosystem. This is an early opportunity to be part of something huge.

Interested? Let's talk!
— GhostChain Growth Team`;
}

export async function sendProposal(influencer: Influencer): Promise<Deal> {
  const compensation = `${Math.round(influencer.followers / 1000) * 10} GST`;
  const proposal     = await generateProposal(influencer);

  const deal: Deal = {
    influencerId:   influencer.id,
    influencerName: influencer.name,
    platform:       influencer.platform,
    proposal,
    compensation,
    status:         "proposed",
    proposedAt:     new Date().toISOString(),
  };

  deals.unshift(deal);
  if (deals.length > 200) deals.pop();
  logger.info(`InfluencerDeals: proposal sent to ${influencer.name} [DRY-RUN]`);
  return deal;
}

export async function runDealCycle(limit = 3): Promise<Deal[]> {
  const influencers = await discoverInfluencers();
  const pending     = influencers.slice(0, limit);
  return Promise.all(pending.map(sendProposal));
}

export function getDeals(): Deal[] {
  return deals;
}
