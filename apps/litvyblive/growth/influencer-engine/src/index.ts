import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import Redis from "ioredis";
import { Pool } from "pg";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";

const PORT = Number(process.env.PORT ?? 7031);
const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
const db = new Pool({ connectionString: process.env.DATABASE_URL });

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false }));

// ── Types ─────────────────────────────────────────────────────────────────────
type DealStatus = "pending" | "active" | "completed" | "cancelled";

const DealSchema = z.object({
  influencer_id:   z.string().uuid(),
  name:            z.string().min(2).max(120),
  deal_type:       z.enum(["revenue_share", "flat_fee", "performance_bonus"]),
  commission_rate: z.number().min(0).max(100).optional(),  // revenue_share %
  flat_fee_gst:    z.number().min(0).optional(),
  performance_kpi: z.string().optional(),                  // e.g. "10000_new_viewers"
  bonus_gst:       z.number().min(0).optional(),
  start_date:      z.string().datetime(),
  end_date:        z.string().datetime(),
  notes:           z.string().max(500).optional(),
});

const UpdateDealSchema = DealSchema.partial().extend({ status: z.enum(["active", "completed", "cancelled"]).optional() });

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /influencer/deals — list all deals (optionally filter by status)
app.get("/influencer/deals", async (req: Request, res: Response) => {
  const status = req.query.status as DealStatus | undefined;
  try {
    const { rows } = await db.query(
      `SELECT * FROM influencer_deals ${status ? "WHERE status = $1" : ""} ORDER BY created_at DESC LIMIT 200`,
      status ? [status] : [],
    );
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to fetch deals" });
  }
});

// POST /influencer/deals — create a new deal
app.post("/influencer/deals", async (req: Request, res: Response) => {
  const parsed = DealSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const d = parsed.data;
  const id = uuidv4();
  try {
    await db.query(
      `INSERT INTO influencer_deals
       (id, influencer_id, name, deal_type, commission_rate, flat_fee_gst,
        performance_kpi, bonus_gst, start_date, end_date, notes, status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pending',NOW())`,
      [id, d.influencer_id, d.name, d.deal_type, d.commission_rate ?? null,
       d.flat_fee_gst ?? null, d.performance_kpi ?? null, d.bonus_gst ?? null,
       d.start_date, d.end_date, d.notes ?? null],
    );
    res.status(201).json({ id });
  } catch {
    res.status(500).json({ error: "Failed to create deal" });
  }
});

// PATCH /influencer/deals/:id — update deal fields or status
app.patch("/influencer/deals/:id", async (req: Request, res: Response) => {
  const parsed = UpdateDealSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  for (const [k, v] of Object.entries(parsed.data)) {
    sets.push(`${k} = $${i++}`);
    vals.push(v);
  }
  if (!sets.length) return res.status(400).json({ error: "No fields to update" });
  vals.push(req.params.id);

  try {
    const { rowCount } = await db.query(
      `UPDATE influencer_deals SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $${i}`,
      vals,
    );
    if (!rowCount) return res.status(404).json({ error: "Deal not found" });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to update deal" });
  }
});

// POST /influencer/deals/:id/payout — trigger payout for a completed deal
app.post("/influencer/deals/:id/payout", async (req: Request, res: Response) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM influencer_deals WHERE id = $1`,
      [req.params.id],
    );
    if (!rows[0]) return res.status(404).json({ error: "Deal not found" });
    const deal = rows[0];
    if (deal.status !== "completed") return res.status(409).json({ error: "Deal is not completed" });

    const amount = deal.flat_fee_gst ?? deal.bonus_gst ?? 0;
    await redis.publish(
      "reward:grant",
      JSON.stringify({ user_id: deal.influencer_id, amount_gst: amount, reason: "influencer_deal", deal_id: deal.id }),
    );
    await db.query(`UPDATE influencer_deals SET payout_sent = true, updated_at = NOW() WHERE id = $1`, [deal.id]);
    res.json({ payout_gst: amount });
  } catch {
    res.status(500).json({ error: "Failed to process payout" });
  }
});

// GET /influencer/:id/stats — performance stats for one influencer
app.get("/influencer/:id/stats", async (req: Request, res: Response) => {
  try {
    const { rows } = await db.query(
      `SELECT COUNT(*) AS total_deals,
              SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
              COALESCE(SUM(flat_fee_gst), 0) + COALESCE(SUM(bonus_gst), 0) AS total_payout_gst
       FROM influencer_deals WHERE influencer_id = $1`,
      [req.params.id],
    );
    res.json(rows[0]);
  } catch {
    res.status(500).json({ error: "Failed to fetch influencer stats" });
  }
});

// GET /health
app.get("/health", (_req: Request, res: Response) =>
  res.json({ service: "influencer-engine", port: PORT, status: "ok" }),
);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[influencer-engine]", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => console.log(`[influencer-engine] listening on :${PORT}`));
export default app;
