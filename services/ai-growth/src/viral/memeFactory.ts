/**
 * MemeFactory — generates viral crypto meme concepts for GhostChain.
 * In production this calls an image generation API (DALL-E, Stable Diffusion).
 */

import OpenAI from "openai";
import logger from "../utils/logger";

let openai: OpenAI | null = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export interface MemeConcept {
  id:          string;
  topic:       string;
  caption:     string;
  format:      "image" | "gif" | "video";
  platforms:   string[];
  viralScore:  number; // predicted 0-100
  imagePrompt: string; // prompt for image generation API
  imageUrl?:   string;
  createdAt:   string;
}

const MEME_TEMPLATES = [
  { caption: "Me explaining GhostChain L1→L2→L3 to normies:", format: "image" as const, viralScore: 82 },
  { caption: "ETH gas fees vs GhostChain fees:", format: "image" as const, viralScore: 91 },
  { caption: "When GST pumps and you've been staking since genesis:", format: "gif" as const, viralScore: 88 },
  { caption: "Other blockchains: 30 TPS. GhostChain: *ghost noises*", format: "image" as const, viralScore: 79 },
  { caption: "Developer onboarding: Solidity on GhostChain in 10 mins:", format: "video" as const, viralScore: 75 },
];

const memeHistory: MemeConcept[] = [];

export async function generateMeme(topic: string): Promise<MemeConcept> {
  const template = MEME_TEMPLATES[Math.floor(Math.random() * MEME_TEMPLATES.length)];

  const imagePrompt = `Viral crypto meme about ${topic}. Dark cyberpunk aesthetic. Ghost logo watermark. Bold white text overlay. High impact visual.`;

  let imageUrl: string | undefined;
  if (openai) {
    try {
      const img = await openai.images.generate({
        model:   "dall-e-3",
        prompt:  imagePrompt,
        n:       1,
        size:    "1024x1024",
        quality: "standard",
      });
      imageUrl = img.data?.[0]?.url;
    } catch (err: any) {
      logger.warn("MemeFactory: DALL-E unavailable", { err: err?.message });
    }
  }

  const meme: MemeConcept = {
    id:          `meme-${Date.now()}`,
    topic,
    caption:     template.caption,
    format:      template.format,
    platforms:   ["Twitter", "Reddit", "Telegram", "Discord"],
    viralScore:  template.viralScore + Math.floor(Math.random() * 10 - 5),
    imagePrompt,
    imageUrl,
    createdAt:   new Date().toISOString(),
  };

  memeHistory.unshift(meme);
  if (memeHistory.length > 100) memeHistory.pop();
  logger.info(`MemeFactory: generated meme "${meme.id}" score=${meme.viralScore}`);
  return meme;
}

export function getMemeHistory(): MemeConcept[] {
  return memeHistory;
}
