import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import Redis from "ioredis";
import { Pool } from "pg";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import cron from "node-cron";

const PORT = Number(process.env.PORT ?? 7033);
const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
const db = new Pool({ connectionString: process.env.DATABASE_URL });

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false }));

// ── Schemas ───────────────────────────────────────────────────────────────────
const InviteSchema = z.object({
  candidate_id:   z.string().uuid(),          // platform user to invite
  agency_id:      z.string().uuid().optional(),
  invite_type:    z.enum(["host_upgrade", "agency_join", "creator_onboard"]),
  message:        z.string().max(500).optional(),
  bonus_gst:      z.number().min(0).optional(),
  expires_in_days: z.number().int().min(1).max(60).default(30),
});

const OnboardSchema = z.object({
  invite_id: z.string().uuid(),
  user_id:   z.string().uuid(),
});

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /recruitment/invites — list pending/sent invites
app.get("/recruitment/invites", async (req: Request, res: Response) => {
  const status = req.query.status ?? "pending";
  try {
    const { rows } = await db.query(
      `SELECT * FROM creator_invites WHERE status = $1 ORDER BY created_at DESC LIMIT 200`,
      [status],
    );
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to fetch invites" });
  }
});

// POST /recruitment/invite — create a recruitment invite
app.post("/recruitment/invite", async (req: Request, res: Response) => {
  const parsed = InviteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const d = parsed.data;
  const id = uuidv4();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + d.expires_in_days);

  try {
    await db.query(
      `INSERT INTO creator_invites
       (id, candidate_id, agency_id, invite_type, message, bonus_gst, expires_at, status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',NOW())`,
      [id, d.candidate_id, d.agency_id ?? null, d.invite_type, d.message ?? null,
       d.bonus_gst ?? 0, expiresAt],
    );

    // Publish for notification service
    await redis.publish("notification:send", JSON.stringify({
      user_id: d.candidate_id,
      event:   "creator_invite",
      payload: { invite_id: id, type: d.invite_type, bonus_gst: d.bonus_gst ?? 0 },
    }));

    res.status(201).json({ id, expires_at: expiresAt });
  } catch {
    res.status(500).json({ error: "Failed to send invite" });
  }
});

// POST /recruitment/onboard — user accepts invite and completes onboarding
app.post("/recruitment/onboard", async (req: Request, res: Response) => {
  const parsed = OnboardSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { invite_id, user_id } = parsed.data;
  try {
    const { rows } = await db.query(
      `SELECT * FROM creator_invites WHERE id = $1 AND candidate_id = $2 AND status = 'pending'`,
      [invite_id, user_id],
    );
    if (!rows[0]) return res.status(404).json({ error: "Invite not found or already used" });

    const invite = rows[0];
    if (new Date(invite.expires_at) < new Date())
      return res.status(410).json({ error: "Invite expired" });

    await db.query(
      `UPDATE creator_invites SET status = 'accepted', accepted_at = NOW() WHERE id = $1`,
      [invite_id],
    );

    // Upgrade user to host if invite_type requires
    if (invite.invite_type !== "creator_onboard") {
      await db.query(`UPDATE users SET is_host = true, agency_id = $1 WHERE id = $2`,
        [invite.agency_id ?? null, user_id]);
    }

    // Grant onboarding bonus
    if (invite.bonus_gst > 0) {
      await redis.publish("reward:grant", JSON.stringify({
        user_id, amount_gst: invite.bonus_gst, reason: "creator_onboarding",
      }));
    }

    res.json({ ok: true, bonus_gst: invite.bonus_gst });
  } catch {
    res.status(500).json({ error: "Failed to complete onboarding" });
  }
});

// GET /recruitment/stats — funnel stats
app.get("/recruitment/stats", async (_req: Request, res: Response) => {
  try {
    const { rows } = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'pending')  AS pending,
         COUNT(*) FILTER (WHERE status = 'accepted') AS accepted,
         COUNT(*) FILTER (WHERE status = 'expired')  AS expired,
         COALESCE(SUM(bonus_gst) FILTER (WHERE status = 'accepted'), 0) AS total_bonus_paid
       FROM creator_invites`,
    );
    res.json(rows[0]);
  } catch {
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// GET /health
app.get("/health", (_req: Request, res: Response) =>
  res.json({ service: "creator-recruitment", port: PORT, status: "ok" }),
);

// ── Cron: expire old invites ──────────────────────────────────────────────────
cron.schedule("0 * * * *", async () => {
  try {
    const { rowCount } = await db.query(
      `UPDATE creator_invites SET status = 'expired' WHERE status = 'pending' AND expires_at < NOW()`,
    );
    if (rowCount) console.log(`[creator-recruitment] expired ${rowCount} invites`);
  } catch (err) {
    console.error("[creator-recruitment] cron error:", err);
  }
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[creator-recruitment]", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => console.log(`[creator-recruitment] listening on :${PORT}`));
export default app;
