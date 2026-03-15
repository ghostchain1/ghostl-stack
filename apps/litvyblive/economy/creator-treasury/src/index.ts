/**
 * Creator Treasury Service — port 7040
 *
 * Each creator has a GST treasury that receives:
 *   • gift revenue (via revenue-distribution)
 *   • token sales
 *   • membership subscriptions
 *   • event rewards
 *
 * Withdrawal requests are queued for L3 settlement on GhostChain.
 */

import express, { Application, Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import Redis from "ioredis";
import { Pool } from "pg";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import cron from "node-cron";

const PORT = Number(process.env.PORT ?? 7040);
const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
const db = new Pool({ connectionString: process.env.DATABASE_URL });

// Minimum withdrawal amount (GST, 18 decimals stored as numeric)
const MIN_WITHDRAWAL_GST = 100;
// Platform withdrawal fee: 1%
const WITHDRAWAL_FEE_PCT = 0.01;

const app: Application = express();
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false }));

// ── Cache key helpers ─────────────────────────────────────────────────────────
const BALANCE_KEY = (creatorId: string) => `treasury:balance:${creatorId}`;

async function getBalance(creatorId: string): Promise<{ balance: number; pending_withdrawal: number }> {
  const cached = await redis.get(BALANCE_KEY(creatorId));
  if (cached) return JSON.parse(cached);

  const { rows } = await db.query(
    `SELECT COALESCE(balance, 0) AS balance, COALESCE(pending_withdrawal, 0) AS pending_withdrawal
     FROM creator_treasury WHERE creator_id = $1`,
    [creatorId],
  );
  const result = rows[0] ?? { balance: 0, pending_withdrawal: 0 };
  await redis.set(BALANCE_KEY(creatorId), JSON.stringify(result), "EX", 30);
  return result;
}

async function invalidateBalance(creatorId: string) {
  await redis.del(BALANCE_KEY(creatorId));
}

// ── Credit treasury (internal + Redis sub) ────────────────────────────────────
async function creditTreasury(
  creatorId: string,
  amountGst: number,
  source: string,
  refId?: string,
): Promise<void> {
  const txId = uuidv4();
  await db.query(
    `INSERT INTO creator_treasury (creator_id, balance, pending_withdrawal)
     VALUES ($1, $2, 0)
     ON CONFLICT (creator_id) DO UPDATE
       SET balance = creator_treasury.balance + EXCLUDED.balance`,
    [creatorId, amountGst],
  );
  await db.query(
    `INSERT INTO treasury_transactions (id, creator_id, amount_gst, type, source, ref_id, created_at)
     VALUES ($1,$2,$3,'credit',$4,$5,NOW())`,
    [txId, creatorId, amountGst, source, refId ?? null],
  );
  await invalidateBalance(creatorId);
}

// ── Redis subscriber: treasury:credit events from revenue-distribution ────────
const sub = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
sub.subscribe("treasury:credit", (err) => {
  if (err) console.error("[creator-treasury] subscribe error:", err);
});
sub.on("message", async (_ch, msg) => {
  try {
    const { creator_id, amount_gst, source, ref_id } = JSON.parse(msg);
    if (!creator_id || !amount_gst) return;
    await creditTreasury(creator_id, amount_gst, source ?? "platform", ref_id);
  } catch (err) {
    console.error("[creator-treasury] sub error:", err);
  }
});

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /creator/treasury/:creatorId
app.get("/creator/treasury/:creatorId", async (req: Request, res: Response) => {
  try {
    const bal = await getBalance(req.params.creatorId);
    const { rows: recent } = await db.query(
      `SELECT * FROM treasury_transactions WHERE creator_id = $1
       ORDER BY created_at DESC LIMIT 20`,
      [req.params.creatorId],
    );
    res.json({ creator_id: req.params.creatorId, ...bal, recent_transactions: recent });
  } catch {
    res.status(500).json({ error: "Failed to fetch treasury" });
  }
});

// GET /creator/treasury/:creatorId/history
app.get("/creator/treasury/:creatorId/history", async (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 500);
  const offset = Number(req.query.offset ?? 0);
  try {
    const { rows, rowCount } = await db.query(
      `SELECT * FROM treasury_transactions WHERE creator_id = $1
       ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [req.params.creatorId, limit, offset],
    );
    res.json({ transactions: rows, count: rowCount });
  } catch {
    res.status(500).json({ error: "Failed to fetch history" });
  }
});

// POST /creator/treasury/credit  —  internal endpoint (revenue-distribution calls this)
const CreditSchema = z.object({
  creator_id: z.string().uuid(),
  amount_gst: z.number().positive(),
  source:     z.string().max(64),
  ref_id:     z.string().optional(),
});

app.post("/creator/treasury/credit", async (req: Request, res: Response) => {
  const parsed = CreditSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    await creditTreasury(
      parsed.data.creator_id, parsed.data.amount_gst,
      parsed.data.source, parsed.data.ref_id,
    );
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to credit treasury" });
  }
});

// POST /creator/withdraw  —  creator requests GST withdrawal to their GhostChain wallet
const WithdrawSchema = z.object({
  creator_id:      z.string().uuid(),
  amount_gst:      z.number().positive().min(MIN_WITHDRAWAL_GST),
  ghost_wallet:    z.string().regex(/^0x[0-9a-fA-F]{40}$/, "Must be a valid GhostChain address"),
  two_factor_code: z.string().optional(),
});

app.post("/creator/withdraw", async (req: Request, res: Response) => {
  const parsed = WithdrawSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { creator_id, amount_gst, ghost_wallet } = parsed.data;
  try {
    const bal = await getBalance(creator_id);
    const available = bal.balance - bal.pending_withdrawal;
    if (available < amount_gst)
      return res.status(409).json({ error: "Insufficient treasury balance", available });

    const fee = Math.floor(amount_gst * WITHDRAWAL_FEE_PCT);
    const net  = amount_gst - fee;
    const wdId = uuidv4();

    await db.query(
      `UPDATE creator_treasury SET pending_withdrawal = pending_withdrawal + $1 WHERE creator_id = $2`,
      [amount_gst, creator_id],
    );
    await db.query(
      `INSERT INTO treasury_withdrawals
       (id, creator_id, amount_gst, fee_gst, net_gst, ghost_wallet, status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,'pending',NOW())`,
      [wdId, creator_id, amount_gst, fee, net, ghost_wallet],
    );
    await db.query(
      `INSERT INTO treasury_transactions (id, creator_id, amount_gst, type, source, ref_id, created_at)
       VALUES ($1,$2,$3,'withdrawal','withdraw',$4,NOW())`,
      [uuidv4(), creator_id, -amount_gst, wdId],
    );

    // Push to L3 settlement queue
    await redis.lpush("l3:withdrawal:queue", JSON.stringify({
      withdrawal_id: wdId, creator_id, net_gst: net, ghost_wallet,
    }));
    await invalidateBalance(creator_id);

    res.json({ withdrawal_id: wdId, amount_gst, fee_gst: fee, net_gst: net, status: "pending" });
  } catch {
    res.status(500).json({ error: "Failed to process withdrawal" });
  }
});

// GET /creator/treasury/withdrawals/:creatorId
app.get("/creator/treasury/withdrawals/:creatorId", async (req: Request, res: Response) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM treasury_withdrawals WHERE creator_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.params.creatorId],
    );
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to fetch withdrawals" });
  }
});

// GET /health
app.get("/health", (_req: Request, res: Response) =>
  res.json({ service: "creator-treasury", port: PORT, status: "ok" }),
);

// ── Cron: finalise processed withdrawals from L3 every 10 min ─────────────────
cron.schedule("*/10 * * * *", async () => {
  try {
    // Settlement processor updates status in Redis on confirmation
    const confirmed = await redis.lrange("l3:withdrawal:confirmed", 0, 49);
    if (!confirmed.length) return;

    for (const raw of confirmed) {
      const { withdrawal_id, creator_id, net_gst } = JSON.parse(raw);
      await db.query(
        `UPDATE treasury_withdrawals SET status = 'completed', completed_at = NOW() WHERE id = $1`,
        [withdrawal_id],
      );
      await db.query(
        `UPDATE creator_treasury
         SET balance = balance - $1, pending_withdrawal = pending_withdrawal - $2
         WHERE creator_id = $3`,
        [net_gst, net_gst, creator_id], // fee was already deducted from net
      );
      await invalidateBalance(creator_id);
    }
    await redis.ltrim("l3:withdrawal:confirmed", confirmed.length, -1);
    console.log(`[creator-treasury] finalised ${confirmed.length} withdrawals`);
  } catch (err) {
    console.error("[creator-treasury] cron error:", err);
  }
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[creator-treasury]", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => console.log(`[creator-treasury] listening on :${PORT}`));
export default app;
