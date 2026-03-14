/**
 * DevOutreach — sends personalised migration invitations to developers.
 */

import { scanDevelopers, markContacted, Developer } from "./devScanner";
import OpenAI from "openai";
import logger from "../utils/logger";

let openai: OpenAI | null = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export interface OutreachRecord {
  devId:     string;
  username:  string;
  chain:     string;
  message:   string;
  dryRun:    boolean;
  sentAt:    string;
}

const history: OutreachRecord[] = [];

async function buildMessage(dev: Developer): Promise<string> {
  if (openai) {
    try {
      const comp = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You write concise developer migration invitations for a blockchain ecosystem." },
          { role: "user",   content: `Invite ${dev.username} (${dev.chain} dev, ${dev.followers} followers) to build on GhostChain. Highlight: EVM compatibility, 10× lower gas fees, L2/L3 scaling, GST gas token, grant funding. Max 120 words. Genuine tone.` },
        ],
        max_tokens: 180, temperature: 0.8,
      });
      return comp.choices[0]?.message?.content?.trim() ?? fallback(dev);
    } catch { /* fall through */ }
  }
  return fallback(dev);
}

function fallback(dev: Developer): string {
  return `Hi ${dev.username}!

We noticed your incredible work on ${dev.chain}. GhostChain is an EVM-compatible multi-layer blockchain (L1→L2→L3) and we'd love to have you build on it.

Why migrate?
• Same Solidity tooling you already know
• Gas fees 10× lower than ${dev.chain}
• L2/L3 scaling for mass-adoption apps
• Grant funding in GST available now

Interested? docs.ghostchain.io — let's build!`;
}

export async function inviteDeveloper(dev: Developer): Promise<OutreachRecord> {
  const message = await buildMessage(dev);
  const record: OutreachRecord = {
    devId:    dev.id,
    username: dev.username,
    chain:    dev.chain,
    message,
    dryRun:   true,
    sentAt:   new Date().toISOString(),
  };
  markContacted(dev.id);
  history.unshift(record);
  if (history.length > 500) history.pop();
  logger.info(`DevOutreach: [DRY-RUN] invited ${dev.username} from ${dev.chain}`);
  return record;
}

export async function runOutreachCycle(limit = 5): Promise<OutreachRecord[]> {
  const devs = await scanDevelopers();
  const uncontacted = devs.filter(d => !d.contacted).slice(0, limit);
  return Promise.all(uncontacted.map(inviteDeveloper));
}

export function getHistory(): OutreachRecord[] {
  return history;
}
