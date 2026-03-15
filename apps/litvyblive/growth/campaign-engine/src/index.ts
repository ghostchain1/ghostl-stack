import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import Redis from "ioredis";
import { Pool } from "pg";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";

const PORT = Number(process.env.PORT ?? 7032);
const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
const db = new Pool({ connectionString: process.env.DATABASE_URL });

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false }));

// ── Campaign active-state cache ─────────────────────────────────────────────
const ACTIVE_KEY = "campaigns:active";

async function refreshActiveCache(): Promise<void> {
  const { rows } = await db.query(
    `SELECT id, name, type, gift_multiplier, bonus_gst, metadata
     FROM campaigns
     WHERE status = 'active' AND start_date <= NOW() AND end_date >= NOW()`,
  );
  await redis.set(ACTIVE_KEY, JSON.stringify(rows), "EX", 60);
}

// ── Schemas ───────────────────────────────────────────────────────────────────
const CampaignSchema = z.object({
  name:             z.string().min(2).max(120),
  type:             z.enum(["double_gift", "tournament", "global_pk", "new_user_promo", "creator_challenge"]),
  description:      z.string().max(500).optional(),
  gift_multiplier:  z.number().min(1).max(10).optional(),   // e.g. 2 = double gifts
  bonus_gst:        z.number().min(0).optional(),           // flat bonus for participants
  target_region:    z.string().optional(),                  // null = global
  min_level:        z.number().int().min(1).optional(),
  start_date:       z.string().datetime(),
  end_date:         z.string().datetime(),
  metadata:         z.record(z.unknown()).optional(),
});

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /campaigns — list campaigns
app.get("/campaigns", async (req: Request, res: Response) => {
  const status = req.query.status ?? "active";
  try {
    const { rows } = await db.query(
      `SELECT * FROM campaigns WHERE status = $1 ORDER BY start_date DESC LIMIT 100`,
      [status],
    );
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to fetch campaigns" });
  }
});

// GET /campaigns/active — fast path from Redis cache
app.get("/campaigns/active", async (_req: Request, res: Response) => {
  try {
    const cached = await redis.get(ACTIVE_KEY);
    if (cached) return res.json(JSON.parse(cached));
    await refreshActiveCache();
    const fresh = await redis.get(ACTIVE_KEY);
    res.json(JSON.parse(fresh ?? "[]"));
  } catch {
    res.status(500).json({ error: "Failed to fetch active campaigns" });
  }
});

// POST /campaigns — create campaign (admin)
app.post("/campaigns", async (req: Request, res: Response) => {
  const parsed = CampaignSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const c = parsed.data;
  const id = uuidv4();
  try {
    await db.query(
      `INSERT INTO campaigns
       (id, name, type, description, gift_multiplier, bonus_gst,
        target_region, min_level, start_date, end_date, metadata, status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'active',NOW())`,
      [id, c.name, c.type, c.description ?? null, c.gift_multiplier ?? 1,
       c.bonus_gst ?? 0, c.target_region ?? null, c.min_level ?? 1,
       c.start_date, c.end_date, c.metadata ? JSON.stringify(c.metadata) : null],
    );
    await refreshActiveCache();

    // Publish campaign activation event
    await redis.publish("campaign:activated", JSON.stringify({ id, name: c.name, type: c.type }));
    res.status(201).json({ id });
  } catch {
    res.status(500).json({ error: "Failed to create campaign" });
  }
});

// PATCH /campaigns/:id/status — activate / pause / end campaign
app.patch("/campaigns/:id/status", async (req: Request, res: Response) => {
  const Schema = z.object({ status: z.enum(["active", "paused", "ended"]) });
  const parsed = Schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const { rowCount } = await db.query(
      `UPDATE campaigns SET status = $1, updated_at = NOW() WHERE id = $2`,
      [parsed.data.status, req.params.id],
    );
    if (!rowCount) return res.status(404).json({ error: "Campaign not found" });
    await refreshActiveCache();
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to update campaign status" });
  }
});

// GET /campaigns/:id/participants — list participants/entries
app.get("/campaigns/:id/participants", async (req: Request, res: Response) => {
  try {
    const { rows } = await db.query(
      `SELECT user_id, score, joined_at FROM campaign_participants
       WHERE campaign_id = $1 ORDER BY score DESC LIMIT 200`,
      [req.params.id],
    );
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to fetch participants" });
  }
});

// POST /campaigns/:id/join — user joins a campaign
app.post("/campaigns/:id/join", async (req: Request, res: Response) => {
  const Schema = z.object({ user_id: z.string().uuid() });
  const parsed = Schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    await db.query(
      `INSERT INTO campaign_participants (campaign_id, user_id, joined_at, score)
       VALUES ($1, $2, NOW(), 0) ON CONFLICT DO NOTHING`,
      [req.params.id, parsed.data.user_id],
    );
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to join campaign" });
  }
});

// GET /health
app.get("/health", (_req: Request, res: Response) =>
  res.json({ service: "campaign-engine", port: PORT, status: "ok" }),
);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[campaign-engine]", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => console.log(`[campaign-engine] listening on :${PORT}`));
export default app;
