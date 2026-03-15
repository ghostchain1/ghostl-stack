/**
 * Fan Memberships Service — port 7041
 *
 * Tiers:     Bronze · Silver · Gold · VIP
 * Benefits:  VIP chat, exclusive streams, custom badges, private gifts
 * Billing:   monthly GST debit from fan wallet → revenue-distribution
 */

import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import Redis from "ioredis";
import { Pool } from "pg";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import cron from "node-cron";

const PORT = Number(process.env.PORT ?? 7041);
const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
const db = new Pool({ connectionString: process.env.DATABASE_URL });

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false }));

// ── Tier definitions ──────────────────────────────────────────────────────────
export type MemberTier = "bronze" | "silver" | "gold" | "vip";

const TIERS: Record<MemberTier, { price_gst: number; benefits: string[] }> = {
  bronze: {
    price_gst: 50,
    benefits: ["custom_badge", "chat_highlight"],
  },
  silver: {
    price_gst: 150,
    benefits: ["custom_badge", "chat_highlight", "exclusive_streams", "private_gifts"],
  },
  gold: {
    price_gst: 400,
    benefits: ["custom_badge", "chat_highlight", "exclusive_streams", "private_gifts", "vip_chat", "monthly_gift"],
  },
  vip: {
    price_gst: 1000,
    benefits: ["custom_badge", "chat_highlight", "exclusive_streams", "private_gifts", "vip_chat", "monthly_gift", "direct_message", "meet_greet_access"],
  },
};

// ── Membership lookup ─────────────────────────────────────────────────────────
const MEMBER_KEY = (fanId: string, creatorId: string) => `member:${fanId}:${creatorId}`;

async function activeMembership(fanId: string, creatorId: string) {
  const cached = await redis.get(MEMBER_KEY(fanId, creatorId));
  if (cached) return JSON.parse(cached);

  const { rows } = await db.query(
    `SELECT * FROM fan_memberships
     WHERE fan_id = $1 AND creator_id = $2 AND status = 'active' AND expires_at > NOW()`,
    [fanId, creatorId],
  );
  if (rows[0]) await redis.set(MEMBER_KEY(fanId, creatorId), JSON.stringify(rows[0]), "EX", 300);
  return rows[0] ?? null;
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /membership/tiers — list available tiers + pricing
app.get("/membership/tiers", (_req: Request, res: Response) => res.json(TIERS));

// POST /membership/join — fan subscribes to a creator tier
const JoinSchema = z.object({
  fan_id:     z.string().uuid(),
  creator_id: z.string().uuid(),
  tier:       z.enum(["bronze", "silver", "gold", "vip"]),
});

app.post("/membership/join", async (req: Request, res: Response) => {
  const parsed = JoinSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { fan_id, creator_id, tier } = parsed.data;
  const tierInfo = TIERS[tier];
  const id = uuidv4();

  try {
    // Cancel any existing lower membership
    await db.query(
      `UPDATE fan_memberships SET status = 'upgraded', updated_at = NOW()
       WHERE fan_id = $1 AND creator_id = $2 AND status = 'active'`,
      [fan_id, creator_id],
    );

    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 1);

    await db.query(
      `INSERT INTO fan_memberships
       (id, fan_id, creator_id, tier, price_gst, benefits, status, started_at, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,'active',NOW(),$7)`,
      [id, fan_id, creator_id, tier, tierInfo.price_gst,
       JSON.stringify(tierInfo.benefits), expiresAt],
    );

    // Trigger payment via revenue-distribution
    await redis.publish("payment:membership", JSON.stringify({
      membership_id: id, fan_id, creator_id,
      amount_gst: tierInfo.price_gst, tier,
    }));

    await redis.del(MEMBER_KEY(fan_id, creator_id));
    res.status(201).json({ membership_id: id, tier, price_gst: tierInfo.price_gst, expires_at: expiresAt });
  } catch {
    res.status(500).json({ error: "Failed to join membership" });
  }
});

// GET /membership/:fanId — all active memberships for a fan
app.get("/membership/:fanId", async (req: Request, res: Response) => {
  try {
    const { rows } = await db.query(
      `SELECT m.*, u.username AS creator_name
       FROM fan_memberships m
       JOIN users u ON u.id = m.creator_id
       WHERE m.fan_id = $1 AND m.status = 'active' AND m.expires_at > NOW()
       ORDER BY m.started_at DESC`,
      [req.params.fanId],
    );
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to fetch memberships" });
  }
});

// GET /membership/creator/:creatorId — creator's member list
app.get("/membership/creator/:creatorId", async (req: Request, res: Response) => {
  const tier = req.query.tier as MemberTier | undefined;
  try {
    const { rows } = await db.query(
      `SELECT m.id, m.fan_id, u.username AS fan_name, m.tier, m.started_at, m.expires_at
       FROM fan_memberships m
       JOIN users u ON u.id = m.fan_id
       WHERE m.creator_id = $1 AND m.status = 'active' AND m.expires_at > NOW()
         ${tier ? "AND m.tier = $2" : ""}
       ORDER BY m.tier DESC, m.started_at DESC LIMIT 200`,
      tier ? [req.params.creatorId, tier] : [req.params.creatorId],
    );
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to fetch members" });
  }
});

// GET /membership/creator/:creatorId/stats — revenue + count per tier
app.get("/membership/creator/:creatorId/stats", async (req: Request, res: Response) => {
  try {
    const { rows } = await db.query(
      `SELECT tier, COUNT(*) AS members, SUM(price_gst) AS monthly_revenue_gst
       FROM fan_memberships
       WHERE creator_id = $1 AND status = 'active' AND expires_at > NOW()
       GROUP BY tier`,
      [req.params.creatorId],
    );
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// DELETE /membership/:id — cancel membership
app.delete("/membership/:id", async (req: Request, res: Response) => {
  const Schema = z.object({ fan_id: z.string().uuid() });
  const parsed = Schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const { rowCount, rows } = await db.query(
      `UPDATE fan_memberships SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1 AND fan_id = $2 AND status = 'active'
       RETURNING fan_id, creator_id`,
      [req.params.id, parsed.data.fan_id],
    );
    if (!rowCount) return res.status(404).json({ error: "Membership not found or not yours" });
    await redis.del(MEMBER_KEY(rows[0].fan_id, rows[0].creator_id));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to cancel membership" });
  }
});

// GET /membership/check  — quick entitlement check used by stream gates
app.get("/membership/check", async (req: Request, res: Response) => {
  const { fan_id, creator_id } = req.query as Record<string, string>;
  if (!fan_id || !creator_id) return res.status(400).json({ error: "fan_id and creator_id required" });

  try {
    const m = await activeMembership(fan_id, creator_id);
    res.json({ active: !!m, tier: m?.tier ?? null, benefits: m ? JSON.parse(m.benefits) : [] });
  } catch {
    res.status(500).json({ error: "Failed to check membership" });
  }
});

// GET /health
app.get("/health", (_req: Request, res: Response) =>
  res.json({ service: "fan-memberships", port: PORT, status: "ok" }),
);

// ── Cron: expire + auto-renew memberships daily ───────────────────────────────
cron.schedule("30 0 * * *", async () => {
  try {
    // Mark expired
    const { rows: expired } = await db.query(
      `UPDATE fan_memberships SET status = 'expired', updated_at = NOW()
       WHERE status = 'active' AND expires_at < NOW()
       RETURNING fan_id, creator_id`,
    );
    for (const r of expired) await redis.del(MEMBER_KEY(r.fan_id, r.creator_id));

    // Publish renewal events (payment service handles charging)
    const { rows: due } = await db.query(
      `SELECT id, fan_id, creator_id, tier, price_gst FROM fan_memberships
       WHERE status = 'active' AND expires_at BETWEEN NOW() AND NOW() + INTERVAL '2 days'`,
    );
    for (const m of due) {
      await redis.publish("payment:membership_renewal", JSON.stringify({
        membership_id: m.id, fan_id: m.fan_id, creator_id: m.creator_id,
        amount_gst: m.price_gst, tier: m.tier,
      }));
    }
    console.log(`[fan-memberships] expired ${expired.length}, renewal notices ${due.length}`);
  } catch (err) {
    console.error("[fan-memberships] cron error:", err);
  }
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[fan-memberships]", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => console.log(`[fan-memberships] listening on :${PORT}`));
export default app;
