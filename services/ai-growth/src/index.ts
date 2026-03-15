/**
 * ai-growth service — Viral Growth Engine entry point (port 9971).
 */

import "dotenv/config";
import express from "express";
import cron from "node-cron";
import { generateMeme, getMemeHistory } from "./viral/memeFactory";
import { createCampaign, tickCampaigns, getCampaigns } from "./viral/viralCampaigns";
import { discoverInfluencers, getAllInfluencers } from "./influencers/influencerDiscovery";
import { runDealCycle, getDeals } from "./influencers/influencerDeals";
import { generateShortsBatch, getRandomShortTopic } from "./video/shortsGenerator";
import { getVideoQueue } from "./video/youtubeAutomation";
import { getReferralStats } from "./community/referralEngine";
import { getLeaderboard, getTiers } from "./community/rewardSystem";
import { runAirdrop, getAirdropHistory } from "./token/airdropEngine";
import { fetchTokenMetrics, optimizeTokenDemand, getMetrics } from "./token/tokenGrowth";
import { rankCampaigns, calculateVirality } from "./analytics/viralityScore";
import logger from "./utils/logger";

const app  = express();
const PORT = Number(process.env.PORT ?? 9971);
app.use(express.json());

const started = Date.now();
let cycleCount = 0;

// ── Health ────────────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "ai-growth", port: PORT, cycleCount, uptimeSec: Math.floor((Date.now() - started) / 1000) });
});

// ── Viral ─────────────────────────────────────────────────────────────────────
app.get("/viral/memes",     (_req, res) => { res.json(getMemeHistory()); });
app.get("/viral/campaigns", (_req, res) => { res.json(getCampaigns()); });
app.post("/viral/meme",     async (req, res) => {
  const topic = req.body?.topic ?? "GhostChain";
  try { res.json(await generateMeme(topic)); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Influencers ───────────────────────────────────────────────────────────────
app.get("/influencers",      (_req, res) => { res.json(getAllInfluencers()); });
app.get("/influencers/deals",(_req, res) => { res.json(getDeals()); });

// ── Video ─────────────────────────────────────────────────────────────────────
app.get("/video/queue", (_req, res) => { res.json(getVideoQueue()); });

// ── Community ─────────────────────────────────────────────────────────────────
app.get("/community/referrals",   (_req, res) => { res.json(getReferralStats()); });
app.get("/community/leaderboard", (_req, res) => { res.json(getLeaderboard()); });
app.get("/community/tiers",       (_req, res) => { res.json(getTiers()); });

// ── Token ─────────────────────────────────────────────────────────────────────
app.get("/token/metrics", async (_req, res) => {
  try { res.json(await fetchTokenMetrics()); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});
app.get("/token/airdrop-history", (_req, res) => { res.json(getAirdropHistory()); });

// ── Analytics ─────────────────────────────────────────────────────────────────
app.get("/analytics/virality", (_req, res) => { res.json(rankCampaigns()); });

// ── Autonomous scheduler ──────────────────────────────────────────────────────

// Every 30 min: launch new viral campaign + meme
cron.schedule("*/30 * * * *", async () => {
  try {
    cycleCount++;
    await Promise.allSettled([
      createCampaign(),
      generateMeme("GhostChain"),
      optimizeTokenDemand(),
    ]);
    tickCampaigns();
  } catch (err: any) {
    logger.error("ai-growth: campaign cycle error", { err: err?.message });
  }
});

// Every 2 hours: influencer deal cycle + shorts batch
cron.schedule("0 */2 * * *", async () => {
  try {
    await Promise.allSettled([
      runDealCycle(2),
      generateShortsBatch(3),
    ]);
  } catch (err: any) {
    logger.error("ai-growth: influencer/video cycle error", { err: err?.message });
  }
});

// Weekly Monday 10:00: airdrop
cron.schedule("0 10 * * 1", async () => {
  try { await runAirdrop(50_000, 500); }
  catch (err: any) { logger.error("ai-growth: airdrop error", { err: err?.message }); }
});

// Every 15 min: refresh token metrics
cron.schedule("*/15 * * * *", async () => {
  try { await fetchTokenMetrics(); }
  catch { /* ignore */ }
});

app.listen(PORT, () => {
  logger.info(`ai-growth service listening on port ${PORT}`);
});
