/**
 * Staking Engine — port 7044
 *
 * Fans stake GST into a creator staking pool, earning yield paid by platform
 * revenue share.  Positions lock for 7 days; early unstake forfeits yield.
 *
 * Annual yield: 12% (ANNUAL_YIELD_BPS = 1200 bps)
 * Daily cron accrues rewards every 24 h; weekly settlement batch.
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

const PORT = Number(process.env.PORT ?? 7044);
const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
const db = new Pool({ connectionString: process.env.DATABASE_URL });

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false }));

// ── Constants ─────────────────────────────────────────────────────────────────
const ANNUAL_YIELD_BPS  = 1200;   // 12% APY
const LOCK_DAYS         = 7;
const MIN_STAKE_GST     = 10;
const EARLY_EXIT_FEE_PCT = 0.10; // 10% forfeiture on early unstake

const dailyYieldRate = ANNUAL_YIELD_BPS / 10_000 / 365;

// ── Helpers ───────────────────────────────────────────────────────────────────
async function poolStats(creatorId: string) {
  const { rows } = await db.query(
    `SELECT COALESCE(SUM(staked_gst),0) AS total_staked,
            COUNT(*)                    AS staker_count,
            COALESCE(SUM(pending_yield_gst),0) AS total_pending_yield
     FROM staking_positions
     WHERE creator_id = $1 AND status = 'active'`,
    [creatorId],
  );
  return rows[0];
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /pool/:creatorId — pool stats
app.get("/pool/:creatorId", async (req: Request, res: Response) => {
  try {
    const stats = await poolStats(req.params.creatorId);
    res.json({ creator_id: req.params.creatorId, apy_bps: ANNUAL_YIELD_BPS, ...stats });
  } catch {
    res.status(500).json({ error: "Failed to fetch pool stats" });
  }
});

// POST /stake — stake GST into a creator pool
const StakeSchema = z.object({
  user_id:    z.string().uuid(),
  creator_id: z.string().uuid(),
  amount_gst: z.number().positive().min(MIN_STAKE_GST),
});

app.post("/stake", async (req: Request, res: Response) => {
  const parsed = StakeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { user_id, creator_id, amount_gst } = parsed.data;
  const positionId = uuidv4();
  const unlocksAt  = new Date(Date.now() + LOCK_DAYS * 86_400_000);

  try {
    await db.query(
      `INSERT INTO staking_positions
       (id, user_id, creator_id, staked_gst, pending_yield_gst, status, locked_until, created_at)
       VALUES ($1,$2,$3,$4,0,'active',$5,NOW())`,
      [positionId, user_id, creator_id, amount_gst, unlocksAt],
    );

    // Debit sender via treasury
    await redis.publish("payment:stake", JSON.stringify({ user_id, creator_id, amount_gst, position_id: positionId }));

    // Update Redis-cached pool stats
    await redis.del(`staking:pool:${creator_id}`);

    res.status(201).json({
      position_id: positionId,
      staked_gst:  amount_gst,
      apy_bps:     ANNUAL_YIELD_BPS,
      locked_until: unlocksAt.toISOString(),
    });
  } catch {
    res.status(500).json({ error: "Failed to create stake position" });
  }
});

// POST /unstake — withdraw stake (penalty if before lock period)
const UnstakeSchema = z.object({
  position_id: z.string().uuid(),
  user_id:     z.string().uuid(),
});

app.post("/unstake", async (req: Request, res: Response) => {
  const parsed = UnstakeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { position_id, user_id } = parsed.data;
  try {
    const { rows } = await db.query(
      `SELECT * FROM staking_positions WHERE id = $1 AND user_id = $2 AND status = 'active'`,
      [position_id, user_id],
    );
    if (!rows[0]) return res.status(404).json({ error: "Active position not found" });

    const pos = rows[0];
    const earlyExit = new Date(pos.locked_until) > new Date();
    const returnGst = earlyExit
      ? pos.staked_gst * (1 - EARLY_EXIT_FEE_PCT)
      : pos.staked_gst + pos.pending_yield_gst;

    await db.query(
      `UPDATE staking_positions SET status = $1, unstaked_at = NOW(), returned_gst = $2 WHERE id = $3`,
      [earlyExit ? "early_exit" : "closed", returnGst, position_id],
    );

    await redis.publish("payment:unstake_return", JSON.stringify({
      user_id, creator_id: pos.creator_id, amount_gst: returnGst,
      position_id, early_exit: earlyExit,
    }));

    await redis.del(`staking:pool:${pos.creator_id}`);
    res.json({ ok: true, returned_gst: returnGst, early_exit: earlyExit });
  } catch {
    res.status(500).json({ error: "Failed to unstake" });
  }
});

// GET /stake/:userId — all staking positions for a user
app.get("/stake/:userId", async (req: Request, res: Response) => {
  try {
    const { rows } = await db.query(
      `SELECT sp.id, sp.creator_id, sp.staked_gst, sp.pending_yield_gst,
              sp.status, sp.locked_until, sp.created_at
       FROM staking_positions sp WHERE sp.user_id = $1 ORDER BY sp.created_at DESC`,
      [req.params.userId],
    );
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to fetch staking positions" });
  }
});

// GET /stake/:userId/rewards — pending yield across all positions
app.get("/stake/:userId/rewards", async (req: Request, res: Response) => {
  try {
    const { rows } = await db.query(
      `SELECT COALESCE(SUM(pending_yield_gst),0) AS total_pending_gst
       FROM staking_positions WHERE user_id = $1 AND status = 'active'`,
      [req.params.userId],
    );
    res.json({ user_id: req.params.userId, pending_yield_gst: Number(rows[0].total_pending_gst) });
  } catch {
    res.status(500).json({ error: "Failed to fetch rewards" });
  }
});

// POST /stake/claim — claim all pending yield
const ClaimSchema = z.object({ user_id: z.string().uuid() });

app.post("/stake/claim", async (req: Request, res: Response) => {
  const parsed = ClaimSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { user_id } = parsed.data;
  try {
    const { rows } = await db.query(
      `UPDATE staking_positions SET pending_yield_gst = 0
       WHERE user_id = $1 AND status = 'active' AND pending_yield_gst > 0
       RETURNING staked_gst, pending_yield_gst AS claimed_gst, creator_id`,
      [user_id],
    );
    const totalClaimed = rows.reduce((sum, r) => sum + Number(r.claimed_gst), 0);
    if (totalClaimed === 0) return res.json({ claimed_gst: 0 });

    await redis.publish("treasury:credit", JSON.stringify({
      creator_id: user_id, amount_gst: totalClaimed, source: "staking_yield",
    }));
    res.json({ claimed_gst: totalClaimed, positions: rows.length });
  } catch {
    res.status(500).json({ error: "Failed to claim rewards" });
  }
});

// GET /health
app.get("/health", (_req: Request, res: Response) =>
  res.json({ service: "staking-engine", port: PORT, status: "ok" }),
);

// ── Daily yield accrual cron (midnight UTC) ───────────────────────────────────
cron.schedule("0 0 * * *", async () => {
  console.log("[staking-engine] accruing daily yield...");
  try {
    const { rowCount } = await db.query(
      `UPDATE staking_positions
       SET pending_yield_gst = pending_yield_gst + staked_gst * $1
       WHERE status = 'active'`,
      [dailyYieldRate],
    );
    console.log(`[staking-engine] yield accrued for ${rowCount} positions`);
  } catch (err) {
    console.error("[staking-engine] yield cron error", err);
  }
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[staking-engine]", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => console.log(`[staking-engine] listening on :${PORT}`));
export default app;
