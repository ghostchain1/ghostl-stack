/**
 * Growth Analytics — measures the effectiveness of marketing campaigns and
 * the overall platform growth driven by GhostBrain.
 *
 * Metrics tracked:
 *   • new user registrations (platform growth)
 *   • creator follower growth per campaign
 *   • gift GST revenue change during campaign windows
 *   • campaign ROI  = (gift_revenue_delta / budget_gst) × 100
 *   • channel conversion (new users who came via a social channel)
 *
 * Snapshots are written to `growth_snapshots` periodically (hourly cron)
 * and can be queried for dashboard reports.
 */

import { v4 as uuid } from 'uuid';
import { getDb } from '../backend/src/db/index.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GrowthSnapshot {
  snapshot_id:        string;
  period_start:       string;  // ISO datetime
  period_end:         string;
  new_users:          number;
  active_creators:    number;
  total_gifts_gst:    number;
  new_followers:      number;
  campaigns_active:   number;
  campaigns_complete: number;
  created_at:         string;
}

export interface CampaignROI {
  campaign_id:        string;
  campaign_title:     string;
  budget_gst:         number;
  gift_revenue_delta: number;
  new_followers:      number;
  roi_pct:            number;  // (gift_revenue_delta / budget_gst) * 100
}

// ── Snapshot capture ──────────────────────────────────────────────────────────

/**
 * Capture a platform growth snapshot for the given window.
 * Reads live data from core tables.
 */
export function captureSnapshot(
  periodStart: string,
  periodEnd:   string
): GrowthSnapshot {
  const db = getDb();

  const newUsers = (db.prepare(`
    SELECT COUNT(*) as cnt FROM users WHERE created_at BETWEEN ? AND ?
  `).get(periodStart, periodEnd) as { cnt: number }).cnt;

  const activeCreators = (db.prepare(`
    SELECT COUNT(DISTINCT creator_id) as cnt
    FROM   streams
    WHERE  started_at BETWEEN ? AND ?
  `).get(periodStart, periodEnd) as { cnt: number }).cnt;

  const totalGiftsGst = (db.prepare(`
    SELECT COALESCE(SUM(amount_gst), 0) as total
    FROM   gifts
    WHERE  sent_at BETWEEN ? AND ?
  `).get(periodStart, periodEnd) as { total: number }).total;

  const newFollowers = (db.prepare(`
    SELECT COUNT(*) as cnt FROM follows WHERE followed_at BETWEEN ? AND ?
  `).get(periodStart, periodEnd) as { cnt: number }).cnt;

  const campaignsActive = (db.prepare(`
    SELECT COUNT(*) as cnt FROM campaigns
    WHERE  status = 'active'
  `).get() as { cnt: number }).cnt;

  const campaignsComplete = (db.prepare(`
    SELECT COUNT(*) as cnt FROM campaigns
    WHERE  status = 'complete' AND ends_at BETWEEN ? AND ?
  `).get(periodStart, periodEnd) as { cnt: number }).cnt;

  const id = uuid();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO growth_snapshots
      (snapshot_id, period_start, period_end, new_users, active_creators,
       total_gifts_gst, new_followers, campaigns_active, campaigns_complete, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, periodStart, periodEnd,
    newUsers, activeCreators, totalGiftsGst, newFollowers,
    campaignsActive, campaignsComplete, now
  );

  return getSnapshot(id)!;
}

export function getSnapshot(snapshotId: string): GrowthSnapshot | null {
  const db = getDb();
  return db.prepare('SELECT * FROM growth_snapshots WHERE snapshot_id = ?').get(snapshotId) as GrowthSnapshot | null;
}

export function listSnapshots(limit = 30): GrowthSnapshot[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM growth_snapshots ORDER BY period_start DESC LIMIT ?
  `).all(limit) as GrowthSnapshot[];
}

// ── Campaign ROI ──────────────────────────────────────────────────────────────

/**
 * Compute ROI for a campaign by comparing gift revenue during vs. before the
 * campaign window.
 */
export function computeCampaignROI(campaignId: string): CampaignROI | null {
  const db = getDb();

  const row = db.prepare(`
    SELECT campaign_id, title, budget_gst, starts_at, ends_at
    FROM campaigns WHERE campaign_id = ?
  `).get(campaignId) as { campaign_id: string; title: string; budget_gst: number; starts_at: string; ends_at: string } | null;
  if (!row) return null;

  const durationMs = new Date(row.ends_at).getTime() - new Date(row.starts_at).getTime();
  const beforeStart = new Date(new Date(row.starts_at).getTime() - durationMs).toISOString();

  const revDuring = (db.prepare(`
    SELECT COALESCE(SUM(amount_gst), 0) as total FROM gifts
    WHERE sent_at BETWEEN ? AND ?
  `).get(row.starts_at, row.ends_at) as { total: number }).total;

  const revBefore = (db.prepare(`
    SELECT COALESCE(SUM(amount_gst), 0) as total FROM gifts
    WHERE sent_at BETWEEN ? AND ?
  `).get(beforeStart, row.starts_at) as { total: number }).total;

  const delta = revDuring - revBefore;
  const roi   = row.budget_gst > 0 ? (delta / row.budget_gst) * 100 : 0;

  const newFollowers = (db.prepare(`
    SELECT COUNT(*) as cnt FROM follows WHERE followed_at BETWEEN ? AND ?
  `).get(row.starts_at, row.ends_at) as { cnt: number }).cnt;

  return {
    campaign_id:        row.campaign_id,
    campaign_title:     row.title,
    budget_gst:         row.budget_gst,
    gift_revenue_delta: delta,
    new_followers:      newFollowers,
    roi_pct:            parseFloat(roi.toFixed(2)),
  };
}

/** Return ROI for all completed campaigns, best first. */
export function allCampaignROIs(): CampaignROI[] {
  const db = getDb();
  const ids = db.prepare(`
    SELECT campaign_id FROM campaigns WHERE status = 'complete' ORDER BY ends_at DESC
  `).all() as { campaign_id: string }[];

  return ids
    .map(r => computeCampaignROI(r.campaign_id))
    .filter((r): r is CampaignROI => r !== null)
    .sort((a, b) => b.roi_pct - a.roi_pct);
}

// ── Summary report ────────────────────────────────────────────────────────────

/** Aggregate growth over a date range for the admin dashboard. */
export function growthSummary(fromDate: string, toDate: string): {
  totalNewUsers:     number;
  totalGiftsGst:     number;
  totalNewFollowers: number;
  avgRoiPct:         number;
  topCampaignId:     string | null;
} {
  const db = getDb();

  const newUsers = (db.prepare(`
    SELECT COUNT(*) as cnt FROM users WHERE created_at BETWEEN ? AND ?
  `).get(fromDate, toDate) as { cnt: number }).cnt;

  const giftsGst = (db.prepare(`
    SELECT COALESCE(SUM(amount_gst), 0) as total FROM gifts WHERE sent_at BETWEEN ? AND ?
  `).get(fromDate, toDate) as { total: number }).total;

  const newFollowers = (db.prepare(`
    SELECT COUNT(*) as cnt FROM follows WHERE followed_at BETWEEN ? AND ?
  `).get(fromDate, toDate) as { cnt: number }).cnt;

  const rois = allCampaignROIs();
  const avgRoi = rois.length
    ? rois.reduce((s, r) => s + r.roi_pct, 0) / rois.length
    : 0;

  return {
    totalNewUsers:     newUsers,
    totalGiftsGst:     giftsGst,
    totalNewFollowers: newFollowers,
    avgRoiPct:         parseFloat(avgRoi.toFixed(2)),
    topCampaignId:     rois[0]?.campaign_id ?? null,
  };
}
