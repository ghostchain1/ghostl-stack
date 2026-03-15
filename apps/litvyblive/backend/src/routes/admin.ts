import { Router } from 'express';
import { getDb } from '../db/index.js';

export const adminRouter = Router();

const GHOSTBRAIN_URL = process.env.GHOSTBRAIN_URL ?? 'http://localhost:7002';

/** GET /admin/stats — aggregate platform numbers for the dashboard. */
adminRouter.get('/stats', (_req, res) => {
  const db = getDb();

  const { totalUsers }     = db.prepare('SELECT COUNT(*) as totalUsers FROM users').get() as { totalUsers: number };
  const { liveStreams }    = db.prepare("SELECT COUNT(*) as liveStreams FROM streams WHERE is_live=1").get() as { liveStreams: number };
  const { activeAgencies } = db.prepare('SELECT COUNT(DISTINCT agency_id) as activeAgencies FROM users WHERE agency_id IS NOT NULL').get() as { activeAgencies: number };

  // GST volume: sum of gift prices sent in the last 24 hours
  const { gstVolume24h } = db
    .prepare("SELECT IFNULL(SUM(price_gst),0) as gstVolume24h FROM gifts WHERE created_at >= datetime('now','-1 day')")
    .get() as { gstVolume24h: number };

  res.json({ totalUsers, liveStreams, gstVolume24h, activeAgencies });
});

/** GET /admin/revenue — daily GST volume for the last 30 days. */
adminRouter.get('/revenue', (_req, res) => {
  const db = getDb();

  const rows = db
    .prepare(`
      SELECT date(created_at) as date, IFNULL(SUM(price_gst),0) as gst
      FROM gifts
      WHERE created_at >= datetime('now', '-30 days')
      GROUP BY date(created_at)
      ORDER BY date(created_at) ASC
    `)
    .all() as { date: string; gst: number }[];

  res.json(rows);
});

/** GET /admin/treasury/summary — per-creator earnings + staking summary. */
adminRouter.get('/treasury/summary', (_req, res) => {
  const db = getDb();
  // Returns aggregate per creator — staked_balance approximated as 0 until
  // the on-chain sync is wired up; pending_earnings = unclaimed gift revenue.
  const rows = db
    .prepare(`
      SELECT
        u.id                       as creatorId,
        IFNULL(SUM(g.price_gst),0) as pendingEarnings,
        0                          as stakedBalance,
        MAX(g.created_at)          as lastClaimAt
      FROM users u
      LEFT JOIN gifts g ON g.recipient_id = u.id
      WHERE u.is_host = 1
      GROUP BY u.id
    `)
    .all();
  res.json(rows);
});

/** GET /admin/ghostbrain — proxy the governor state from the AI service. */
adminRouter.get('/ghostbrain', async (_req, res) => {
  try {
    const upstream = await fetch(`${GHOSTBRAIN_URL}/governor/state`);
    if (!upstream.ok) {
      res.status(502).json({ error: 'GhostBrain governor unavailable' });
      return;
    }
    const state = await upstream.json();
    res.json(state);
  } catch {
    res.status(503).json({ error: 'GhostBrain service unreachable' });
  }
});

/** GET /admin/ghostbrain/decisions — last 100 decisions, newest first. */
adminRouter.get('/ghostbrain/decisions', async (_req, res) => {
  try {
    const upstream = await fetch(`${GHOSTBRAIN_URL}/governor/decisions`);
    if (!upstream.ok) {
      res.status(502).json({ error: 'GhostBrain governor unavailable' });
      return;
    }
    const decisions = await upstream.json();
    res.json(decisions);
  } catch {
    res.status(503).json({ error: 'GhostBrain service unreachable' });
  }
});
