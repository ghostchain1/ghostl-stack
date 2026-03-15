/**
 * GhostBrain Marketing AI — Master Orchestrator
 *
 * Runs a continuous marketing intelligence loop:
 *   1. Sweep viral signals (viewer growth, gift spikes, chat bursts, follower surges)
 *   2. Auto-launch campaigns for trending creators
 *   3. Distribute every new campaign to all 6 social channels
 *   4. Record growth snapshots hourly
 *   5. Expire stale trending scores and finished campaigns
 *
 * Designed to be driven by an external cron every 60 seconds.
 * Exposes a singleton `marketingAI` for route handlers to call manually.
 */

import {
  sweepSignal,
  expireTrending,
  getTrendingCreators,
  type ViralSignal,
} from './viral_detector.js';
import {
  autoLaunchViralCampaigns,
  expireCampaigns,
  listCampaigns,
  type Campaign,
} from './campaign_manager.js';
import {
  distributeToAll,
  channelReachSummary,
  type SocialDistribution,
} from './social_distribution.js';
import {
  captureSnapshot,
  growthSummary,
  allCampaignROIs,
  type GrowthSnapshot,
  type CampaignROI,
} from './growth_analytics.js';
import { getDb } from '../backend/src/db/index.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MarketingCycleResult {
  viralsDetected:    number;
  campaignLaunched:  number;
  distributionsSent: number;
  snapshotId:        string | null;
  errors:            string[];
}

export interface MarketingStatus {
  trendingCount:     number;
  activeCampaigns:   number;
  completeCampaigns: number;
  totalDistributed:  number;
}

// ── Signal snapshot helpers ───────────────────────────────────────────────────

/**
 * Pull live metric snapshots from the DB for the viral detector.
 * Maps each ViralSignal type to a data source query.
 */
async function getSignalSnapshot(
  signal: ViralSignal,
  creatorId: string
): Promise<number> {
  const db = getDb();
  const window10 = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const window5  = new Date(Date.now() -  5 * 60 * 1000).toISOString();
  const window1h = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  if (signal === 'viewer_growth') {
    const cur = (db.prepare(`
      SELECT peak_viewers FROM stream_stats
      WHERE creator_id = ? ORDER BY recorded_at DESC LIMIT 1
    `).get(creatorId) as { peak_viewers: number } | null)?.peak_viewers ?? 0;
    const prev = (db.prepare(`
      SELECT peak_viewers FROM stream_stats
      WHERE creator_id = ? AND recorded_at < ? ORDER BY recorded_at DESC LIMIT 1
    `).get(creatorId, window10) as { peak_viewers: number } | null)?.peak_viewers ?? 1;
    return prev > 0 ? ((cur - prev) / prev) * 100 : 0;
  }

  if (signal === 'gift_spike') {
    return (db.prepare(`
      SELECT COALESCE(SUM(amount_gst), 0) as total FROM gifts
      WHERE creator_id = ? AND sent_at > ?
    `).get(creatorId, window5) as { total: number }).total;
  }

  if (signal === 'chat_burst') {
    return (db.prepare(`
      SELECT COUNT(*) as cnt FROM chat_messages
      WHERE stream_creator_id = ? AND sent_at > ?
    `).get(creatorId, window5) as { cnt: number }).cnt;
  }

  if (signal === 'follower_surge') {
    return (db.prepare(`
      SELECT COUNT(*) as cnt FROM follows
      WHERE creator_id = ? AND followed_at > ?
    `).get(creatorId, window1h) as { cnt: number }).cnt;
  }

  return 0;
}

// ── MarketingAI class ─────────────────────────────────────────────────────────

export class MarketingAI {
  private readonly DEFAULT_CAMPAIGN_BUDGET_GST = 500;

  // ── Step 1: Viral detection ─────────────────────────────────────────────────

  async detectViralStreams(): Promise<void> {
    const db = getDb();
    const signals: ViralSignal[] = [
      'viewer_growth', 'gift_spike', 'chat_burst', 'follower_surge',
    ];

    // Get all creators with an active stream
    const liveCreators = db.prepare(`
      SELECT DISTINCT creator_id FROM streams WHERE ended_at IS NULL
    `).all() as { creator_id: string }[];

    for (const signal of signals) {
      await sweepSignal(signal, async () => {
        const snapshots: Array<{ creatorId: string; value: number }> = [];
        for (const { creator_id } of liveCreators) {
          snapshots.push({ creatorId: creator_id, value: await getSignalSnapshot(signal, creator_id) });
        }
        return snapshots;
      });
    }

    // Also sweep creators who streamed in the last hour even if not live
    const window1h = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const recentCreators = db.prepare(`
      SELECT DISTINCT creator_id FROM streams WHERE started_at > ?
    `).all(window1h) as { creator_id: string }[];

    const seen = new Set(liveCreators.map(r => r.creator_id));
    for (const { creator_id } of recentCreators) {
      if (seen.has(creator_id)) continue;
      seen.add(creator_id);
      for (const signal of signals) {
        await sweepSignal(signal, async () => [{ creatorId: creator_id, value: await getSignalSnapshot(signal, creator_id) }]);
      }
    }
  }

  // ── Step 2: Auto-launch campaigns ──────────────────────────────────────────

  async launchViralCampaigns(): Promise<Campaign[]> {
    return autoLaunchViralCampaigns(this.DEFAULT_CAMPAIGN_BUDGET_GST);
  }

  // ── Step 3: Distribute new active campaigns ────────────────────────────────

  async distributeNewCampaigns(): Promise<SocialDistribution[]> {
    const db = getDb();

    // Campaigns that are active but not yet distributed
    const pending = db.prepare(`
      SELECT c.campaign_id, c.creator_id, c.title
      FROM campaigns c
      WHERE c.status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM social_distributions sd WHERE sd.campaign_id = c.campaign_id
        )
    `).all() as { campaign_id: string; creator_id: string; title: string }[];

    const all: SocialDistribution[] = [];
    for (const row of pending) {
      const distributions = await distributeToAll({
        campaignId:   row.campaign_id,
        creatorId:    row.creator_id,
        streamTitle:  row.title,
      });
      all.push(...distributions);
    }
    return all;
  }

  // ── Step 4: Snapshot growth ────────────────────────────────────────────────

  captureHourlySnapshot(): GrowthSnapshot | null {
    const now   = new Date();
    const end   = now.toISOString();
    const start = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    try {
      return captureSnapshot(start, end);
    } catch {
      return null;
    }
  }

  // ── Step 5: Housekeeping ───────────────────────────────────────────────────

  async housekeeping(): Promise<void> {
    expireTrending(60);   // expire trending creators older than 60 min
    expireCampaigns();    // flip past-endDate campaigns to 'complete'
  }

  // ── Full cycle (called every 60s) ─────────────────────────────────────────

  async runMarketingCycle(): Promise<MarketingCycleResult> {
    const errors: string[] = [];
    let viralsDetected    = 0;
    let campaignLaunched  = 0;
    let distributionsSent = 0;
    let snapshotId: string | null = null;

    try {
      await this.detectViralStreams();
      viralsDetected = (await getTrendingCreators(100)).length;
    } catch (e) {
      errors.push(`viralDetection: ${String(e)}`);
    }

    try {
      const launched = await this.launchViralCampaigns();
      campaignLaunched = launched.length;
    } catch (e) {
      errors.push(`campaignLaunch: ${String(e)}`);
    }

    try {
      const dists = await this.distributeNewCampaigns();
      distributionsSent = dists.length;
    } catch (e) {
      errors.push(`distribution: ${String(e)}`);
    }

    // Capture snapshot once per hour (check last snapshot time)
    try {
      const db = getDb();
      const last = db.prepare(`
        SELECT created_at FROM growth_snapshots ORDER BY created_at DESC LIMIT 1
      `).get() as { created_at: string } | null;
      const shouldSnap = !last ||
        Date.now() - new Date(last.created_at).getTime() > 55 * 60 * 1000;
      if (shouldSnap) {
        snapshotId = this.captureHourlySnapshot()?.snapshot_id ?? null;
      }
    } catch (e) {
      errors.push(`snapshot: ${String(e)}`);
    }

    try {
      await this.housekeeping();
    } catch (e) {
      errors.push(`housekeeping: ${String(e)}`);
    }

    return { viralsDetected, campaignLaunched, distributionsSent, snapshotId, errors };
  }

  // ── Status ─────────────────────────────────────────────────────────────────

  async getStatus(): Promise<MarketingStatus> {
    const db = getDb();
    const trending = await getTrendingCreators(1000);
    const active   = (db.prepare(`SELECT COUNT(*) as cnt FROM campaigns WHERE status = 'active'`).get()    as { cnt: number }).cnt;
    const complete = (db.prepare(`SELECT COUNT(*) as cnt FROM campaigns WHERE status = 'complete'`).get() as { cnt: number }).cnt;
    const dists    = (db.prepare(`SELECT COUNT(*) as cnt FROM social_distributions WHERE status = 'sent'`).get() as { cnt: number }).cnt;
    return {
      trendingCount:     trending.length,
      activeCampaigns:   active,
      completeCampaigns: complete,
      totalDistributed:  dists,
    };
  }

  // ── Analytics helpers (proxy for routes) ──────────────────────────────────

  async getGrowthSummary(fromDate: string, toDate: string) {
    return growthSummary(fromDate, toDate);
  }

  async getTopROIs(): Promise<CampaignROI[]> {
    return allCampaignROIs().slice(0, 10);
  }
}

export const marketingAI = new MarketingAI();
