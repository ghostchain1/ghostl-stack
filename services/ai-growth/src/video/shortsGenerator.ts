/**
 * ShortsGenerator — produces rapid-fire short-form video scripts for
 * TikTok and YouTube Shorts to drive viral GhostChain awareness.
 */

import { createVideo } from "./youtubeAutomation";
import logger from "../utils/logger";

const SHORT_TOPICS = [
  "Why GhostChain has zero gas fees",
  "GST token explained in 60 seconds",
  "GhostChain vs Ethereum — who wins?",
  "How GhostL2 makes DeFi affordable",
  "Building your first dApp on GhostChain",
  "GhostXchange: the fastest DEX in crypto",
  "What is GST staking?",
  "GhostVyb: earn crypto while streaming",
];

export async function generateShortsBatch(count = 5) {
  const topics = SHORT_TOPICS.slice(0, count);
  const jobs   = await Promise.all(topics.map(t => createVideo(t, true)));
  logger.info(`ShortsGenerator: produced ${jobs.length} shorts`);
  return jobs;
}

export function getRandomShortTopic(): string {
  return SHORT_TOPICS[Math.floor(Math.random() * SHORT_TOPICS.length)];
}
