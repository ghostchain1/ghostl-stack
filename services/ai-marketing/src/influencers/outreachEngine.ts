/**
 * OutreachEngine — sends personalised AI-generated collaboration proposals
 * to discovered influencers. Dry-runs without email/DM credentials.
 */

import { findInfluencers, markContacted, Influencer } from "./influencerScanner";
import OpenAI from "openai";
import logger from "../utils/logger";

let openai: OpenAI | null = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export interface OutreachRecord {
  influencerId: string;
  influencerName: string;
  platform:     string;
  message:      string;
  dryRun:       boolean;
  sentAt:       string;
}

const outreachHistory: OutreachRecord[] = [];

async function generateProposal(inf: Influencer): Promise<string> {
  if (openai) {
    try {
      const comp = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You write professional but engaging collaboration proposals for blockchain projects." },
          { role: "user",   content: `Write a short DM/email to ${inf.name} (${inf.platform}, ${inf.followers.toLocaleString()} followers) proposing a GhostChain collaboration. Offer GST token compensation. Keep it under 150 words. Be genuine and crypto-native.` },
        ],
        max_tokens: 200,
        temperature: 0.8,
      });
      return comp.choices[0]?.message?.content?.trim() ?? fallbackProposal(inf);
    } catch { /* fall through */ }
  }
  return fallbackProposal(inf);
}

function fallbackProposal(inf: Influencer): string {
  return `Hey ${inf.name}! 👻

We're building GhostChain — a next-gen multi-layer blockchain (L1→L2→L3) and we love your content on ${inf.platform}.

We'd love to collaborate on a GhostChain feature or sponsored post. Compensation available in GST tokens (our native gas token, deflationary + yield-bearing).

Let us know if you're interested and we'll send full details!

— GhostChain Marketing Team
`;
}

export async function runOutreachCampaign(limit = 3): Promise<OutreachRecord[]> {
  const candidates = await findInfluencers();
  const uncontacted = candidates.filter(i => !i.contacted).slice(0, limit);

  const records: OutreachRecord[] = [];

  for (const inf of uncontacted) {
    const message = await generateProposal(inf);
    const record: OutreachRecord = {
      influencerId:   inf.id,
      influencerName: inf.name,
      platform:       inf.platform,
      message,
      dryRun:         true,  // real send would call email/DM API
      sentAt:         new Date().toISOString(),
    };

    logger.info(`OutreachEngine: [DRY-RUN] outreach to ${inf.name} on ${inf.platform}`);
    markContacted(inf.id);
    records.push(record);
    outreachHistory.unshift(record);
  }

  if (outreachHistory.length > 200) outreachHistory.splice(200);
  return records;
}

export function getOutreachHistory(): OutreachRecord[] {
  return outreachHistory;
}
