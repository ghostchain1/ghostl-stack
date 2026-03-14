/**
 * ai-marketing service — entry point.
 *
 * Starts the HTTP API server (port 9970) and launches the autonomous
 * campaign scheduler.
 */

import "dotenv/config";
import express from "express";
import brain from "./brain/marketingBrain";
import strategyEngine from "./brain/strategyEngine";
import { getCampaigns, getSummary } from "./analytics/campaignAnalytics";
import { predictGrowth } from "./analytics/growthPredictor";
import { getTopKeywords } from "./seo/keywordScanner";
import { getAllInfluencers } from "./influencers/influencerScanner";
import { getOutreachHistory } from "./influencers/outreachEngine";
import { getRecentTweets } from "./social/twitterBot";
import { getRecentPosts } from "./social/redditBot";
import { getRecentMessages as discordMsgs } from "./social/discordBot";
import { getRecentMessages as telegramMsgs } from "./social/telegramBot";
import { getVariants as googleVariants } from "./ads/googleAdsAI";
import { getAds as twitterAds } from "./ads/twitterAdsAI";
import { getLastAllocation } from "./treasury/marketingBudget";
import { startCampaignScheduler } from "./scheduler/campaignScheduler";
import logger from "./utils/logger";

const app  = express();
const PORT = Number(process.env.PORT ?? 9970);

app.use(express.json());

// ── Health ────────────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "ai-marketing", port: PORT, ...brain.status() });
});

// ── Brain / Strategy ──────────────────────────────────────────────────────────
app.get("/brain/market", async (_req, res) => {
  try { res.json(await brain.analyzeMarket()); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get("/brain/strategy", async (_req, res) => {
  try { res.json(await strategyEngine.generatePlan()); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Analytics ─────────────────────────────────────────────────────────────────
app.get("/analytics/campaigns", (_req, res) => { res.json(getCampaigns()); });
app.get("/analytics/summary",   (_req, res) => { res.json(getSummary()); });
app.get("/analytics/forecast",  async (_req, res) => {
  try { res.json(await predictGrowth()); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── SEO ───────────────────────────────────────────────────────────────────────
app.get("/seo/keywords", (_req, res) => { res.json(getTopKeywords(20)); });

// ── Influencers ───────────────────────────────────────────────────────────────
app.get("/influencers",         (_req, res) => { res.json(getAllInfluencers()); });
app.get("/influencers/outreach",(_req, res) => { res.json(getOutreachHistory()); });

// ── Social ────────────────────────────────────────────────────────────────────
app.get("/social/twitter",  (_req, res) => { res.json(getRecentTweets()); });
app.get("/social/reddit",   (_req, res) => { res.json(getRecentPosts()); });
app.get("/social/discord",  (_req, res) => { res.json(discordMsgs()); });
app.get("/social/telegram", (_req, res) => { res.json(telegramMsgs()); });

// ── Ads ───────────────────────────────────────────────────────────────────────
app.get("/ads/google",  (_req, res) => { res.json(googleVariants()); });
app.get("/ads/twitter", (_req, res) => { res.json(twitterAds()); });

// ── Treasury ──────────────────────────────────────────────────────────────────
app.get("/treasury/budget", (_req, res) => { res.json(getLastAllocation()); });

app.listen(PORT, () => {
  logger.info(`ai-marketing service listening on port ${PORT}`);
  startCampaignScheduler();
});
