/**
 * TweetGenerator — produces viral, crypto-native tweets for Ghost ecosystem.
 * Uses OpenAI when API key is present; falls back to templated content.
 */

import OpenAI from "openai";
import logger from "../utils/logger";

let openai: OpenAI | null = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

const TEMPLATES: Record<string, string[]> = {
  default: [
    "🚀 GhostChain is redefining what fast means in blockchain. Sub-second finality, built for scale. /GST/ #GhostChain #L1 #Crypto",
    "The future is gasless. GhostL2 delivers near-zero fees with the security of GhostChain L1. /GST/ holders ride free. #GhostChain",
    "📦 Developers: build on GhostL3. Deploy your app, leverage L1 security, pay gas in /GST/. Grant funding available. #GhostChain #Web3",
    "🔥 GhostXchange — the first DEX native to GhostChain. Trade, stake, earn /GST/ rewards. #DeFi #GhostChain",
    "🎵 GhostVyb: stream, create, earn. The first Web3 live-streaming platform powered by /GST/ tips. #GhostVyb #Web3",
  ],
  developer: [
    "Calling all Solidity devs 👻 GhostChain is EVM-compatible, 10× cheaper, and growing fast. Deploy today. #GhostChain #BuildOnGhost",
    "GhostL3 grants are open. Ship your dApp, we fund your gas. /GST/ ecosystem growing daily. #GhostGrants #Web3Dev",
  ],
  token: [
    "🪙 /GST/ — the gas token powering GhostChain L1 + L2 + L3. Every tx burns a micro-amount. Supply shrinks. Demand grows. #GST",
    "📊 /GST/ tokenomics: deflationary on-chain, yield-bearing on GhostXchange, governance weight on-chain. #GhostChain #Tokenomics",
  ],
};

export async function generateTweet(topic: string): Promise<string> {
  if (openai) {
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You write viral, engaging crypto Twitter posts. Keep them under 280 characters. Use relevant hashtags. Mention GhostChain or GST where natural.",
          },
          {
            role: "user",
            content: `Write a viral tweet about: ${topic}. Mention GhostChain and GST token. Make it crypto-native and engaging.`,
          },
        ],
        max_tokens: 120,
        temperature: 0.9,
      });
      return completion.choices[0]?.message?.content?.trim() ?? fallbackTweet(topic);
    } catch (err) {
      logger.warn("generateTweet: OpenAI error, using template", { err });
    }
  }
  return fallbackTweet(topic);
}

function fallbackTweet(topic: string): string {
  const topicLower = topic.toLowerCase();
  const pool =
    topicLower.includes("develop") ? TEMPLATES.developer :
    topicLower.includes("token")   ? TEMPLATES.token     :
    TEMPLATES.default;
  return pool[Math.floor(Math.random() * pool.length)];
}

export async function generateTweetThread(topic: string, count = 3): Promise<string[]> {
  const tweets: string[] = [];
  for (let i = 0; i < count; i++) {
    tweets.push(await generateTweet(`${topic} (part ${i + 1})`));
  }
  return tweets;
}
