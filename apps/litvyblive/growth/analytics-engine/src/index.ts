import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import Redis from "ioredis";
import { Pool } from "pg";
import { z } from "zod";
import cron from "node-cron";

const PORT = Number(process.env.PORT ?? 7036);
const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
const db = new Pool({ connectionString: process.env.DATABASE_URL });

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false }));

// ── Cache helpers ─────────────────────────────────────────────────────────────
const CACHE_TTL = 120; // seconds

async function cachedQuery<T>(key: string, query: () => Promise<T>): Promise<T> {
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached) as T;

  const result = await query();
  await redis.set(key, JSON.stringify(result), "EX", CACHE_TTL);
  return result;
}

// ── Date range validation ─────────────────────────────────────────────────────
const DateRangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  days: z.coerce.number().int().min(1).max(365).default(30),
});

function dateRange(q: { from?: string; to?: string; days: number }) {
  const to   = q.to   ? new Date(q.to)   : new Date();
  const from = q.from ? new Date(q.from) : new Date(Date.now() - q.days * 86_400_000);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /analytics/dau — daily active users time series
app.get("/analytics/dau", async (req: Request, res: Response) => {
  const parsed = DateRangeSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { from, to } = dateRange(parsed.data);
  try {
    const data = await cachedQuery(`dau:${from}:${to}`, () =>
      db.query(
        `SELECT date::text, dau, new_users, retained_users
         FROM analytics_daily_users
         WHERE date BETWEEN $1 AND $2
         ORDER BY date`,
        [from, to],
      ).then((r) => r.rows),
    );
    res.json(data);
  } catch {
    res.status(500).json({ error: "Failed to fetch DAU data" });
  }
});

// GET /analytics/gift-volume — GST gift volume time series
app.get("/analytics/gift-volume", async (req: Request, res: Response) => {
  const parsed = DateRangeSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { from, to } = dateRange(parsed.data);
  try {
    const data = await cachedQuery(`gift-vol:${from}:${to}`, () =>
      db.query(
        `SELECT date::text, SUM(gift_gst) AS gift_volume_gst, COUNT(*) AS gift_count
         FROM gift_events WHERE date BETWEEN $1 AND $2 GROUP BY date ORDER BY date`,
        [from, to],
      ).then((r) => r.rows),
    );
    res.json(data);
  } catch {
    res.status(500).json({ error: "Failed to fetch gift volume" });
  }
});

// GET /analytics/creator-earnings — top creator earnings in a period
app.get("/analytics/creator-earnings", async (req: Request, res: Response) => {
  const parsed = DateRangeSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { from, to } = dateRange(parsed.data);
  const limit = Math.min(Number(req.query.limit ?? 50), 200);

  try {
    const data = await cachedQuery(`creator-earn:${from}:${to}:${limit}`, () =>
      db.query(
        `SELECT u.id, u.username, u.agency_id,
                COALESCE(SUM(rg.amount_gst), 0) AS total_earned_gst
         FROM users u
         JOIN reward_grants rg ON rg.user_id = u.id
         WHERE u.is_host = true
           AND rg.created_at::date BETWEEN $1 AND $2
           AND rg.reason IN ('gift_payout', 'pk_winner', 'event_prize')
         GROUP BY u.id, u.username, u.agency_id
         ORDER BY total_earned_gst DESC
         LIMIT $3`,
        [from, to, limit],
      ).then((r) => r.rows),
    );
    res.json(data);
  } catch {
    res.status(500).json({ error: "Failed to fetch creator earnings" });
  }
});

// GET /analytics/referrals — referral conversion funnel
app.get("/analytics/referrals", async (req: Request, res: Response) => {
  const parsed = DateRangeSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { from, to } = dateRange(parsed.data);
  try {
    const data = await cachedQuery(`referrals:${from}:${to}`, () =>
      db.query(
        `SELECT
           date_trunc('day', created_at)::date::text AS date,
           COUNT(*) AS referrals,
           SUM(reward_gst) AS gst_paid
         FROM referral_events
         WHERE created_at::date BETWEEN $1 AND $2
         GROUP BY 1 ORDER BY 1`,
        [from, to],
      ).then((r) => r.rows),
    );
    res.json(data);
  } catch {
    res.status(500).json({ error: "Failed to fetch referral data" });
  }
});

// GET /analytics/retention — 7-day and 30-day retention cohorts
app.get("/analytics/retention", async (_req: Request, res: Response) => {
  try {
    const data = await cachedQuery("retention:cohorts", () =>
      db.query(
        `SELECT cohort_week, d1_retention, d7_retention, d30_retention
         FROM analytics_retention_cohorts
         ORDER BY cohort_week DESC LIMIT 12`,
      ).then((r) => r.rows),
    );
    res.json(data);
  } catch {
    res.status(500).json({ error: "Failed to fetch retention data" });
  }
});

// GET /analytics/campaigns — campaign performance summary
app.get("/analytics/campaigns", async (req: Request, res: Response) => {
  const parsed = DateRangeSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { from, to } = dateRange(parsed.data);
  try {
    const data = await cachedQuery(`campaigns:perf:${from}:${to}`, () =>
      db.query(
        `SELECT c.id, c.name, c.type,
                COUNT(cp.user_id) AS participants,
                COALESCE(SUM(rg.amount_gst) FILTER (WHERE rg.reason = 'campaign_reward'), 0) AS gst_distributed
         FROM campaigns c
         LEFT JOIN campaign_participants cp ON cp.campaign_id = c.id
         LEFT JOIN reward_grants rg ON rg.ref_id = c.id::text
         WHERE c.start_date::date <= $2 AND c.end_date::date >= $1
         GROUP BY c.id, c.name, c.type
         ORDER BY participants DESC`,
        [from, to],
      ).then((r) => r.rows),
    );
    res.json(data);
  } catch {
    res.status(500).json({ error: "Failed to fetch campaign performance" });
  }
});

// GET /analytics/summary — real-time snapshot
app.get("/analytics/summary", async (_req: Request, res: Response) => {
  try {
    const [users, gifts, rewards] = await Promise.all([
      db.query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 day') AS new_24h FROM users`),
      db.query(`SELECT COALESCE(SUM(gift_gst),0) AS vol_24h FROM gift_events WHERE created_at > NOW() - INTERVAL '1 day'`),
      db.query(`SELECT COALESCE(SUM(amount_gst),0) AS paid_24h FROM reward_grants WHERE created_at > NOW() - INTERVAL '1 day'`),
    ]);
    res.json({
      total_users:      Number(users.rows[0].total),
      new_users_24h:    Number(users.rows[0].new_24h),
      gift_volume_24h:  Number(gifts.rows[0].vol_24h),
      rewards_paid_24h: Number(rewards.rows[0].paid_24h),
    });
  } catch {
    res.status(500).json({ error: "Failed to fetch summary" });
  }
});

// GET /health
app.get("/health", (_req: Request, res: Response) =>
  res.json({ service: "analytics-engine", port: PORT, status: "ok" }),
);

// ── Cron: roll up daily analytics snapshot ────────────────────────────────────
cron.schedule("5 0 * * *", async () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const date = yesterday.toISOString().slice(0, 10);

  try {
    const { rows: u } = await db.query(
      `SELECT COUNT(*) AS dau FROM sessions WHERE date = $1`, [date],
    );
    const dau = Number(u[0]?.dau ?? 0);

    await db.query(
      `INSERT INTO analytics_daily_users (date, dau, new_users, retained_users)
       SELECT $1, $2,
         (SELECT COUNT(*) FROM users WHERE created_at::date = $1),
         (SELECT COUNT(DISTINCT user_id) FROM sessions WHERE date = $1
            AND user_id IN (SELECT user_id FROM sessions WHERE date = $1::date - 1))
       ON CONFLICT (date) DO UPDATE SET dau = EXCLUDED.dau, new_users = EXCLUDED.new_users`,
      [date, dau],
    );
    console.log(`[analytics-engine] daily rollup done for ${date}`);
  } catch (err) {
    console.error("[analytics-engine] rollup error:", err);
  }
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[analytics-engine]", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => console.log(`[analytics-engine] listening on :${PORT}`));
export default app;
