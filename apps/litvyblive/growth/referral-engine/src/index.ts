import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import Redis from "ioredis";
import { Pool } from "pg";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";

const PORT = Number(process.env.PORT ?? 7030);
const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
const db = new Pool({ connectionString: process.env.DATABASE_URL });

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false }));

// ── Helpers ───────────────────────────────────────────────────────────────────
const REFERRAL_CODE_KEY = (code: string) => `referral:code:${code}`;
const USER_REFERRAL_KEY = (userId: string) => `referral:user:${userId}`;

/** Generate a short alphanumeric code tied to a user. */
async function generateCode(userId: string): Promise<string> {
  const cached = await redis.get(USER_REFERRAL_KEY(userId));
  if (cached) return cached;

  const code = Buffer.from(uuidv4().replace(/-/g, ""), "hex")
    .toString("base64url")
    .slice(0, 8)
    .toUpperCase();

  await redis.set(USER_REFERRAL_KEY(userId), code);
  await redis.set(REFERRAL_CODE_KEY(code), userId);
  await db.query(
    `INSERT INTO referral_codes (user_id, code, created_at) VALUES ($1, $2, NOW()) ON CONFLICT (user_id) DO NOTHING`,
    [userId, code],
  );
  return code;
}

/** Convert a code to the owning user ID. */
async function resolveCode(code: string): Promise<string | null> {
  const cached = await redis.get(REFERRAL_CODE_KEY(code.toUpperCase()));
  if (cached) return cached;

  const { rows } = await db.query<{ user_id: string }>(
    `SELECT user_id FROM referral_codes WHERE code = $1`,
    [code.toUpperCase()],
  );
  if (!rows[0]) return null;
  await redis.set(REFERRAL_CODE_KEY(code.toUpperCase()), rows[0].user_id, "EX", 86400);
  return rows[0].user_id;
}

/** Calculate GST reward for a successful referral based on referrer level. */
function rewardForLevel(level: number): number {
  if (level >= 50) return 500;
  if (level >= 30) return 250;
  if (level >= 10) return 100;
  return 50;
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /referral/code/:userId — get or create referral code for a user
app.get("/referral/code/:userId", async (req: Request, res: Response) => {
  try {
    const code = await generateCode(req.params.userId);
    res.json({ code, link: `https://litvybzlive.ghostchain.cloud/join?ref=${code}` });
  } catch (err) {
    res.status(500).json({ error: "Failed to generate referral code" });
  }
});

// POST /referral/claim — new user claims a referral code
const ClaimSchema = z.object({
  code:      z.string().min(1),
  new_user_id: z.string().uuid(),
});

app.post("/referral/claim", async (req: Request, res: Response) => {
  const parsed = ClaimSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { code, new_user_id } = parsed.data;

  try {
    const referrerId = await resolveCode(code);
    if (!referrerId) return res.status(404).json({ error: "Invalid referral code" });

    // Idempotency check
    const existing = await db.query(
      `SELECT id FROM referral_events WHERE referred_user_id = $1`,
      [new_user_id],
    );
    if (existing.rows.length) return res.status(409).json({ error: "User already referred" });

    // Fetch referrer level for reward calc
    const userRow = await db.query<{ level: number }>(
      `SELECT level FROM users WHERE id = $1`,
      [referrerId],
    );
    const level = userRow.rows[0]?.level ?? 1;
    const reward = rewardForLevel(level);

    await db.query(
      `INSERT INTO referral_events (id, referrer_user_id, referred_user_id, reward_gst, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [uuidv4(), referrerId, new_user_id, reward],
    );

    // Publish reward event for the reward-engine to process
    await redis.publish(
      "reward:grant",
      JSON.stringify({ user_id: referrerId, amount_gst: reward, reason: "referral" }),
    );

    res.json({ referrer_id: referrerId, reward_gst: reward });
  } catch (err) {
    res.status(500).json({ error: "Failed to claim referral" });
  }
});

// GET /referral/stats/:userId — referral stats for a user
app.get("/referral/stats/:userId", async (req: Request, res: Response) => {
  try {
    const { rows } = await db.query(
      `SELECT COUNT(*) AS total_referrals, COALESCE(SUM(reward_gst), 0) AS total_reward_gst
       FROM referral_events WHERE referrer_user_id = $1`,
      [req.params.userId],
    );
    res.json(rows[0]);
  } catch {
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// GET /referral/leaderboard — top referrers
app.get("/referral/leaderboard", async (_req: Request, res: Response) => {
  try {
    const { rows } = await db.query(
      `SELECT referrer_user_id, COUNT(*) AS referrals, SUM(reward_gst) AS total_gst
       FROM referral_events GROUP BY referrer_user_id ORDER BY referrals DESC LIMIT 50`,
    );
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

// GET /health
app.get("/health", (_req: Request, res: Response) =>
  res.json({ service: "referral-engine", port: PORT, status: "ok" }),
);

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[referral-engine]", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => console.log(`[referral-engine] listening on :${PORT}`));
export default app;
