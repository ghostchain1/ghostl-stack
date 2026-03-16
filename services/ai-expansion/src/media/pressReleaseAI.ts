/**
 * PressReleaseAI — generates professional press releases for GhostChain milestones.
 */

import OpenAI from "openai";
import logger from "../utils/logger";

let openai: OpenAI | null = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export interface PressRelease {
  id:        string;
  topic:     string;
  headline:  string;
  body:      string;
  boilerplate: string;
  createdAt: string;
}

const BOILERPLATE = `About GhostChain
GhostChain is a next-generation multi-layer blockchain ecosystem consisting of GhostChain L1 (settlement), GhostL2 (scaling), and GhostL3 (app-chains). Powered by the GST gas token, GhostChain delivers sub-second finality and near-zero transaction fees. Learn more at ghostchain.cloud.

Contact: press@ghostchain.cloud`;

const releases: PressRelease[] = [];

export async function createPressRelease(topic: string): Promise<PressRelease> {
  let body: string;
  let headline: string = `GhostChain Announces: ${topic}`;

  if (openai) {
    try {
      const comp = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You write professional blockchain press releases in AP style. Include headline, dateline, body paragraphs with quotes, and boilerplate." },
          { role: "user", content: `Write a press release about GhostChain: ${topic}. Include a compelling headline, three body paragraphs, and a quote from the CEO. Professional tone.` },
        ],
        max_tokens: 600, temperature: 0.7,
      });
      const text = comp.choices[0]?.message?.content?.trim() ?? "";
      const lines = text.split("\n").filter(Boolean);
      headline = lines[0] ?? headline;
      body     = lines.slice(1).join("\n");
    } catch {
      body = fallbackBody(topic);
    }
  } else {
    body = fallbackBody(topic);
  }

  const release: PressRelease = {
    id:          `pr-${Date.now()}`,
    topic,
    headline,
    body,
    boilerplate: BOILERPLATE,
    createdAt:   new Date().toISOString(),
  };

  releases.unshift(release);
  if (releases.length > 50) releases.pop();
  logger.info(`PressReleaseAI: created release "${release.headline.slice(0, 60)}"`);
  return release;
}

function fallbackBody(topic: string): string {
  return `FOR IMMEDIATE RELEASE

GhostChain, the high-performance multi-layer blockchain ecosystem, today announced ${topic}.

"This milestone represents a major step forward in our mission to build the fastest and most developer-friendly blockchain infrastructure," said the CEO of GhostChain. "With GhostL2 delivering near-zero fees and L3 app-chains enabling enterprise deployments, GhostChain is positioned to become the go-to blockchain for the next wave of Web3 applications."

The announcement further reinforces GhostChain's position as a leading blockchain ecosystem, with its native GST token underpinning all network economics through deflationary mechanics and staking yield.`;
}

export function getReleases(): PressRelease[] {
  return releases;
}
