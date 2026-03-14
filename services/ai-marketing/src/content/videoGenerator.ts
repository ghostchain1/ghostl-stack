/**
 * VideoGenerator — produces AI video briefs/scripts for YouTube and TikTok.
 * In production this integrates with a video generation API (e.g. Synthesia, HeyGen).
 */

import OpenAI from "openai";
import logger from "../utils/logger";

let openai: OpenAI | null = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export interface VideoScript {
  title:    string;
  format:   "short" | "long" | "tutorial" | "announcement";
  script:   string;
  voiceTone: string;
  duration:  string;
  uploadTargets: string[];
  createdAt: string;
}

const VIDEO_FORMATS: Array<VideoScript["format"]> = ["short", "long", "tutorial", "announcement"];

export async function generateVideoScript(topic: string, format: VideoScript["format"] = "short"): Promise<VideoScript> {
  const durationMap = { short: "60s", long: "8-10min", tutorial: "15min", announcement: "3min" };

  let script: string;
  if (openai) {
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You write ${format} video scripts for a blockchain company. Be energetic, clear, and crypto-native. Include [SCENE], [B-ROLL], and [CTA] markers.`,
          },
          {
            role: "user",
            content: `Write a ${format} video script about: ${topic}. Feature GhostChain and GST token. Target: ${durationMap[format]}.`,
          },
        ],
        max_tokens: 800,
        temperature: 0.8,
      });
      script = completion.choices[0]?.message?.content?.trim() ?? fallbackScript(topic, format);
    } catch (err) {
      logger.warn("generateVideoScript: OpenAI error", { err });
      script = fallbackScript(topic, format);
    }
  } else {
    script = fallbackScript(topic, format);
  }

  return {
    title:         topic,
    format,
    script,
    voiceTone:     "energetic, authoritative, crypto-native",
    duration:      durationMap[format],
    uploadTargets: format === "short" ? ["YouTube Shorts", "TikTok"] : ["YouTube"],
    createdAt:     new Date().toISOString(),
  };
}

function fallbackScript(topic: string, format: string): string {
  return `[SCENE: Ghost logo animation over dark background]

HOST: "GhostChain is changing everything about blockchain.

${topic}.

[B-ROLL: Transaction speed comparison chart]

Host: GhostChain delivers sub-second finality, near-zero fees — powered by GST, the gas token of the Ghost ecosystem.

[B-ROLL: GhostXchange DEX interface]

Whether you're a developer building the next DeFi app, or a trader looking for speed — GhostChain has you covered.

[CTA]
Host: Visit ghostchain.io today. Grab some GST. Build something great.

[SCENE: Ghost logo + website URL]
#GhostChain #GST #Web3 #Blockchain"
`;
}

export function getRandomFormat(): VideoScript["format"] {
  return VIDEO_FORMATS[Math.floor(Math.random() * VIDEO_FORMATS.length)];
}
