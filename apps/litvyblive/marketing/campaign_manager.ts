/**
 * Campaign Manager — launches and tracks automated marketing campaigns.
 *
 * Campaign types:
 *   • new_creator_promo  — surface new creator to the discovery feed
 *   • viral_stream_boost — amplify a trending stream homepage placement
 *   • event_promotion    — push-notification blast for upcoming event
 *   • global_tournament  — cross-region tournament announcement
 *
 * Each campaign has a GST budget (spent on-chain via MarketingCampaignVault),
 * a duration, and an optional GhostBrain-generated content snippet.
 */

import { v4 as uuid } from 'uuid';
import { getDb } from '../backend/src/db/index.js';
import { getTrendingCreators } from './viral_detector.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type CampaignType =
  | 'new_creator_promo'
  | 'viral_stream_boost'
  | 'event_promotion'
  | 'global_tournament';

export type CampaignStatus =
  | 'scheduled'
  | 'active'
  | 'paused'
  | 'complete'
  | 'cancelled';

export interface Campaign {
  campaign_id:  string;
  creator_id:   string | null;  // null for platform-wide campaigns
  type:         CampaignType;
  title:        string;
  description:  string;
  budget_gst:   number;         // GST reserved on-chain in CampaignVault
  spent_gst:    number;
  starts_at:    string;
  ends_at:      string;
  status:       CampaignStatus;
  vault_tx_hash: string | null;
  created_at:   string;
}

// ── Create ────────────────────────────────────────────────────────────────────

export function createCampaign(params: {
  creatorId:    string | null;
  type:         CampaignType;
  title:        string;
  description:  string;
  budgetGst:    number;
  durationHours: number;
  vaultTxHash?: string;
}): Campaign {
  const db = getDb();
  const id        = uuid();
  const now       = new Date();
  const createdAt = now.toISOString();
  const startsAt  = createdAt;
  const endsAt    = new Date(now.getTime() + params.durationHours * 3_600_000).toISOString();

  db.prepare(`
    INSERT INTO campaigns
      (campaign_id, creator_id, type, title, description,
       budget_gst, spent_gst, starts_at, ends_at, status, vault_tx_hash, created_at)
    VALUES
      (?, ?, ?, ?, ?, ?, 0, ?, ?, 'scheduled', ?, ?)
  `).run(
    id, params.creatorId ?? null, params.type, params.title, params.description,
    params.budgetGst, startsAt, endsAt, params.vaultTxHash ?? null, createdAt
  );

  return getCampaign(id)!;
}

export function getCampaign(campaignId: string): Campaign | null {
  const db = getDb();
  return db.prepare('SELECT * FROM campaigns WHERE campaign_id = ?').get(campaignId) as Campaign | null;
}

export function updateCampaignStatus(campaignId: string, status: CampaignStatus): void {
  const db = getDb();
  db.prepare('UPDATE campaigns SET status = ? WHERE campaign_id = ?').run(status, campaignId);
}

export function recordSpend(campaignId: string, gstAmount: number): void {
  const db = getDb();
  db.prepare('UPDATE campaigns SET spent_gst = spent_gst + ? WHERE campaign_id = ?').run(gstAmount, campaignId);
}

export function listCampaigns(opts: {
  creatorId?: string;
  status?: CampaignStatus;
  limit?: number;
} = {}): Campaign[] {
  const db = getDb();
  const conditions: string[] = [];
  const values: (string | number)[] = [];

  if (opts.creatorId) { conditions.push('creator_id = ?'); values.push(opts.creatorId); }
  if (opts.status)    { conditions.push('status = ?');     values.push(opts.status); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = opts.limit ?? 50;
  values.push(limit);

  return db.prepare(`
    SELECT * FROM campaigns ${where} ORDER BY created_at DESC LIMIT ?
  `).all(...values) as Campaign[];
}

// ── AI-driven auto-launch ─────────────────────────────────────────────────────

/**
 * GhostBrain hook: inspect trending creators and auto-launch viral boost
 * campaigns for those that don't already have an active one.
 * Called by the marketing cron every 5 minutes.
 */
export function autoLaunchViralCampaigns(defaultBudgetGst = 500): Campaign[] {
  const trending = getTrendingCreators(10);
  const launched: Campaign[] = [];

  for (const t of trending) {
    // Skip if creator already has an active campaign
    const db = getDb();
    const existing = db.prepare(`
      SELECT 1 FROM campaigns
      WHERE creator_id = ? AND status IN ('scheduled','active')
      LIMIT 1
    `).get(t.creator_id);
    if (existing) continue;

    const campaign = createCampaign({
      creatorId:    t.creator_id,
      type:         'viral_stream_boost',
      title:        `Auto Viral Boost — ${t.creator_id.slice(0, 8)}`,
      description:  `GhostBrain auto-campaign triggered by ${t.signal} (score ${t.score.toFixed(0)})`,
      budgetGst:    defaultBudgetGst,
      durationHours: 24,
    });
    updateCampaignStatus(campaign.campaign_id, 'active');
    launched.push(campaign);
  }

  return launched;
}

/** Expire campaigns whose end time has passed. */
export function expireCampaigns(): number {
  const db = getDb();
  const info = db.prepare(`
    UPDATE campaigns SET status = 'complete'
    WHERE status IN ('scheduled','active') AND ends_at < datetime('now')
  `).run();
  return info.changes;
}
