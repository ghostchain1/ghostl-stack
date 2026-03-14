/**
 * CampaignScheduler — cron-based engine that drives all autonomous
 * marketing actions on configurable intervals.
 */

import cron from "node-cron";
import brain from "../brain/marketingBrain";
import strategyEngine from "../brain/strategyEngine";
import { runTwitterCampaign } from "../social/twitterBot";
import { runRedditCampaign } from "../social/redditBot";
import { broadcastAnnouncement as discordBroadcast } from "../social/discordBot";
import { broadcastUpdate as telegramBroadcast } from "../social/telegramBot";
import { optimiseAds } from "../ads/googleAdsAI";
import { optimiseTwitterAds } from "../ads/twitterAdsAI";
import { runSeoPublishCycle } from "../seo/seoPublisher";
import { runOutreachCampaign } from "../influencers/outreachEngine";
import { refreshMetrics } from "../analytics/campaignAnalytics";
import { allocateMarketingBudget } from "../treasury/marketingBudget";
import logger from "../utils/logger";

let running = false;

export function startCampaignScheduler(): void {
  if (running) return;
  running = true;
  logger.info("CampaignScheduler: starting autonomous campaign cycles");

  // ── Every 30 minutes: social media posts ──────────────────────────────────
  cron.schedule("*/30 * * * *", async () => {
    try {
      const plan = await strategyEngine.generatePlan();
      const campaign = plan.strategy.campaigns[Math.floor(Math.random() * plan.strategy.campaigns.length)];
      logger.info(`CampaignScheduler: social cycle — topic: "${campaign}"`);
      await Promise.allSettled([
        runTwitterCampaign(campaign),
        telegramBroadcast(`👻 **GhostChain Update**: ${campaign}\n\nVisit ghostchain.io for more. #GhostChain #GST`),
      ]);
    } catch (err: any) {
      logger.error("CampaignScheduler: social cycle error", { err: err?.message });
    }
  });

  // ── Every 2 hours: Reddit + Discord post ─────────────────────────────────
  cron.schedule("0 */2 * * *", async () => {
    try {
      logger.info("CampaignScheduler: community cycle");
      const plan = await strategyEngine.generatePlan();
      const campaign = plan.strategy.campaigns[0];
      await Promise.allSettled([
        runRedditCampaign(campaign, `GhostChain is live and growing fast! Check out our latest on ${campaign}.`),
        discordBroadcast(`📢 **${campaign}**\n\nGhostChain continues to push the boundaries of L1/L2/L3 blockchain. Join the ecosystem! ghostchain.io`),
      ]);
    } catch (err: any) {
      logger.error("CampaignScheduler: community cycle error", { err: err?.message });
    }
  });

  // ── Every 6 hours: ad optimisation ───────────────────────────────────────
  cron.schedule("0 */6 * * *", async () => {
    try {
      logger.info("CampaignScheduler: ad optimisation cycle");
      await Promise.allSettled([optimiseAds(), optimiseTwitterAds()]);
    } catch (err: any) {
      logger.error("CampaignScheduler: ad cycle error", { err: err?.message });
    }
  });

  // ── Daily midnight: SEO publish cycle ────────────────────────────────────
  cron.schedule("0 0 * * *", async () => {
    try {
      logger.info("CampaignScheduler: daily SEO publish");
      await runSeoPublishCycle();
    } catch (err: any) {
      logger.error("CampaignScheduler: SEO cycle error", { err: err?.message });
    }
  });

  // ── Daily at 09:00: influencer outreach ───────────────────────────────────
  cron.schedule("0 9 * * *", async () => {
    try {
      logger.info("CampaignScheduler: daily influencer outreach");
      await runOutreachCampaign(2);
    } catch (err: any) {
      logger.error("CampaignScheduler: outreach cycle error", { err: err?.message });
    }
  });

  // ── Every 15 minutes: analytics refresh ──────────────────────────────────
  cron.schedule("*/15 * * * *", async () => {
    try {
      refreshMetrics();
      await allocateMarketingBudget();
    } catch (err: any) {
      logger.error("CampaignScheduler: analytics cycle error", { err: err?.message });
    }
  });

  logger.info("CampaignScheduler: all cron jobs registered");
}
