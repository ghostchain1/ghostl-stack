import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import Redis from "ioredis";
import { Pool } from "pg";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import cron from "node-cron";

const PORT = Number(process.env.PORT ?? 7035);
const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
const db = new Pool({ connectionString: process.env.DATABASE_URL });

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false }));

// ── Daily login reward table ──────────────────────────────────────────────────
// Streak day → GST reward (caps at day 30)
const DAILY_REWARDS: Record<number, number> = {
  1: 10, 2: 15, 3: 20, 4: 25, 5: 30,
  6: 40, 7: 75,           // week bonus
  14: 150, 21: 300, 28: 500, 30: 1000,
};

function dailyRewardForStreak(streak: number): number {
  // Return reward for exact streak days known, otherwise linear progression
  const known = DAILY_REWARDS[streak];
  if (known !== undefined) return known;
  // Fallback: 10 + 2 per day, capped at 50 for non-milestone days
  return Math.min(10 + streak * 2, 50);
}

// ── Gift multiplier lookup ────────────────────────────────────────────────────
async function getActiveMultiplier(user_id: string): Promise<number> {
  // Check campaign multipliers active for this user via Redis
  const val = await redis.get(`multiplier:${user_id}`);
  if (val) return Number(val);
  const global = await redis.get("multiplier:global");
  return global ? Number(global) : 1;
}

// ── Grant reward (internal helper + public via Redis subscription) ────────────
async function grantReward(user_id: string, amount_gst: number, reason: string, ref_id?: string) {
  const id = uuidv4();
  await db.query(
    `INSERT INTO reward_grants (id, user_id, amount_gst, reason, ref_id, created_at)
     VALUES ($1,$2,$3,$4,$5,NOW())`,
    [id, user_id, amount_gst, reason, ref_id ?? null],
  );
  // Update user GST balance
  await db.query(
    `UPDATE users SET gst_balance = gst_balance + $1 WHERE id = $2`,
    [amount_gst, user_id],
  );
  // Push to settlement queue on GhostL3
  await redis.lpush("l3:settlement:queue", JSON.stringify({ id, user_id, amount_gst, reason }));
  return id;
}

// ── Redis subscription — reward:grant events from other services ─────────────
const sub = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
sub.subscribe("reward:grant", (err) => {
  if (err) console.error("[reward-engine] subscribe error:", err);
});
sub.on("message", async (_channel, message) => {
  try {
    const { user_id, amount_gst, reason, ref_id } = JSON.parse(message);
    if (!user_id || !amount_gst) return;
    await grantReward(user_id, amount_gst, reason ?? "event", ref_id);
  } catch (err) {
    console.error("[reward-engine] sub message error:", err);
  }
});

// ── Routes ────────────────────────────────────────────────────────────────────

// POST /reward/login — claim daily login reward
app.post("/reward/login", async (req: Request, res: Response) => {
  const Schema = z.object({ user_id: z.string().uuid() });
  const parsed = Schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { user_id } = parsed.data;
  const today = new Date().toISOString().slice(0, 10);
  const claimedKey = `login:claimed:${user_id}:${today}`;

  try {
    // Idempotency — only one claim per day per user
    const already = await redis.get(claimedKey);
    if (already) return res.status(409).json({ error: "Already claimed today", claimed_at: already });

    // Streak management
    const streakKey = `login:streak:${user_id}`;
    const lastKey = `login:last:${user_id}`;
    const lastDate = await redis.get(lastKey);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    let streak = lastDate === yesterdayStr ? Number(await redis.get(streakKey) ?? 0) + 1 : 1;
    await redis.set(streakKey, streak);
    await redis.set(lastKey, today);
    await redis.set(claimedKey, new Date().toISOString(), "EX", 90_000); // 25h TTL

    const reward = dailyRewardForStreak(streak);
    await grantReward(user_id, reward, "daily_login");

    res.json({ streak, reward_gst: reward });
  } catch {
    res.status(500).json({ error: "Failed to claim login reward" });
  }
});

// GET /reward/multiplier/:userId — current gift multiplier for a user
app.get("/reward/multiplier/:userId", async (req: Request, res: Response) => {
  try {
    const multiplier = await getActiveMultiplier(req.params.userId);
    res.json({ multiplier });
  } catch {
    res.status(500).json({ error: "Failed to get multiplier" });
  }
});

// POST /reward/multiplier — set a multiplier (admin, campaign-engine calls this)
app.post("/reward/multiplier", async (req: Request, res: Response) => {
  const Schema = z.object({
    user_id:    z.string().uuid().optional(),   // null = global
    multiplier: z.number().min(1).max(10),
    ttl_sec:    z.number().int().min(60).max(86400 * 7).default(3600),
  });
  const parsed = Schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { user_id, multiplier, ttl_sec } = parsed.data;
  const key = user_id ? `multiplier:${user_id}` : "multiplier:global";
  await redis.set(key, multiplier, "EX", ttl_sec);
  res.json({ ok: true, key, multiplier, ttl_sec });
});

// POST /reward/event-prize — grant arbitrary prize (tournament end, etc.)
app.post("/reward/event-prize", async (req: Request, res: Response) => {
  const Schema = z.object({
    user_id:    z.string().uuid(),
    amount_gst: z.number().min(1),
    reason:     z.string().max(200),
    ref_id:     z.string().optional(),
  });
  const parsed = Schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const id = await grantReward(
      parsed.data.user_id, parsed.data.amount_gst,
      parsed.data.reason, parsed.data.ref_id,
    );
    res.json({ grant_id: id });
  } catch {
    res.status(500).json({ error: "Failed to grant prize" });
  }
});

// GET /reward/history/:userId — grant history for a user
app.get("/reward/history/:userId", async (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 500);
  try {
    const { rows } = await db.query(
      `SELECT * FROM reward_grants WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [req.params.userId, limit],
    );
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to fetch history" });
  }
});

// GET /reward/settlement/pending — items not yet settled on L3
app.get("/reward/settlement/pending", async (_req: Request, res: Response) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM reward_grants WHERE settled = false ORDER BY created_at ASC LIMIT 500`,
    );
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to fetch settlement queue" });
  }
});

// GET /health
app.get("/health", (_req: Request, res: Response) =>
  res.json({ service: "reward-engine", port: PORT, status: "ok" }),
);

// ── Cron: flush settlement queue to L3 every 5 minutes ───────────────────────
cron.schedule("*/5 * * * *", async () => {
  try {
    const pending = await redis.lrange("l3:settlement:queue", 0, 99);
    if (!pending.length) return;

    // Mark as settled in DB (L3 bridge picks up from Redis)
    const ids = pending.map((p) => JSON.parse(p).id);
    await db.query(`UPDATE reward_grants SET settled = true WHERE id = ANY($1)`, [ids]);
    await redis.ltrim("l3:settlement:queue", pending.length, -1);
    console.log(`[reward-engine] settled ${pending.length} grants`);
  } catch (err) {
    console.error("[reward-engine] settlement cron error:", err);
  }
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[reward-engine]", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => console.log(`[reward-engine] listening on :${PORT}`));
export default app;
