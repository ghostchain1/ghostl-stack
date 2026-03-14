/**
 * YoutubeAutomation — generates scripts and manages uploads for
 * GhostChain YouTube channel content.
 */

import OpenAI from "openai";
import logger from "../utils/logger";

let openai: OpenAI | null = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export interface VideoJob {
  id:        string;
  topic:     string;
  script:    string;
  title:     string;
  tags:      string[];
  duration:  string;
  status:    "scripted" | "rendered" | "uploaded";
  platform:  "YouTube" | "YouTube Shorts" | "TikTok";
  createdAt: string;
}

const videoQueue: VideoJob[] = [];

export async function createVideo(topic: string, isShort = false): Promise<VideoJob> {
  const title = isShort
    ? `${topic} in 60 seconds 🚀 #GhostChain`
    : `${topic} — Complete Guide | GhostChain`;

  let script: string;
  if (openai) {
    try {
      const comp = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: `You write ${isShort ? "60-second short-form" : "8-minute long-form"} YouTube video scripts for blockchain projects. Include [HOOK], [MAIN], [CTA] sections.` },
          { role: "user",   content: `Write a YouTube ${isShort ? "Short" : "video"} script about: ${topic}. Feature GhostChain and GST token.` },
        ],
        max_tokens: isShort ? 300 : 900,
        temperature: 0.8,
      });
      script = comp.choices[0]?.message?.content?.trim() ?? fallbackScript(topic, isShort);
    } catch {
      script = fallbackScript(topic, isShort);
    }
  } else {
    script = fallbackScript(topic, isShort);
  }

  const job: VideoJob = {
    id:       `vid-${Date.now()}`,
    topic,
    script,
    title,
    tags:     ["GhostChain", "GST", "blockchain", "DeFi", "crypto", "L2", "Web3"],
    duration: isShort ? "60s" : "8-10min",
    status:   "scripted",
    platform: isShort ? "YouTube Shorts" : "YouTube",
    createdAt: new Date().toISOString(),
  };

  videoQueue.unshift(job);
  if (videoQueue.length > 50) videoQueue.pop();
  logger.info(`YoutubeAutomation: created video job "${job.title}"`);
  return job;
}

function fallbackScript(topic: string, isShort: boolean): string {
  if (isShort) {
    return `[HOOK] Did you know GhostChain processes transactions in under a second? Here's why that matters for ${topic}. [MAIN] GhostChain is a multi-layer blockchain — L1 for security, L2 for speed, L3 for apps. GST is the gas token. Buy on GhostXchange. [CTA] Follow for more GhostChain alpha. Link in bio!`;
  }
  return `[HOOK] The blockchain space is crowded — but GhostChain is different. Today we're exploring ${topic}.\n\n[MAIN]\nGhostChain delivers:\n• Sub-second finality on L1\n• Near-zero fees on L2\n• Custom app-chains on L3\n• GST: the deflationary gas token\n\nWe'll walk through how the tech works, why developers are migrating, and how to get started today.\n\n[CTA] Subscribe for weekly GhostChain updates. Grab GST on GhostXchange. Links below.`;
}

export async function uploadVideo(jobId: string): Promise<boolean> {
  const job = videoQueue.find(v => v.id === jobId);
  if (!job) return false;
  // In production: call YouTube Data API v3 to upload
  job.status = "uploaded";
  logger.info(`YoutubeAutomation: [DRY-RUN] uploaded "${job.title}"`);
  return true;
}

export function getVideoQueue(): VideoJob[] {
  return videoQueue;
}
