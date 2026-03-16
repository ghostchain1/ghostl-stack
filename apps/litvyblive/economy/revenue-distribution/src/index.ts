/**
 * Revenue Distribution — port 7045
 *
 * Central revenue-splitting hub.  ALL payment events from fan-memberships,
 * creator-tokens, nft-gifts, staking, and marketplace flow through here.
 *
 * Default split:
 *   Creator  70%  → treasury:credit
 *   Agency   15%  → agency treasury account
 *   Platform 10%  → platform fee wallet
 *   Growth    5%  → growth pool (future fee rebates / burn)
 *
 * Creators can override their split via creator_revenue_splits table
 * (agency cut floors at 5%, platform at 5%).
 */

import express, { Application, Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import Redis from "ioredis";
import { Pool } from "pg";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";

const PORT = Number(process.env.PORT ?? 7045);
const redis    = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
const redisSub = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
const db       = new Pool({ connectionString: process.env.DATABASE_URL });

const app: Application = express();
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false }));

// ── Default split percentages (must sum to 1.0) ───────────────────────────────
const DEFAULT_SPLIT = { creator: 0.70, agency: 0.15, platform: 0.10, growth: 0.05 };

type Split = typeof DEFAULT_SPLIT;

async function splitForCreator(creatorId: string): Promise<Split> {
  const { rows } = await db.query(
    `SELECT creator_pct, agency_pct, platform_pct, growth_pct
     FROM creator_revenue_splits WHERE creator_id = $1 LIMIT 1`,
    [creatorId],
  );
  if (!rows[0]) return DEFAULT_SPLIT;
  return {
    creator:  rows[0].creator_pct  / 100,
    agency:   rows[0].agency_pct   / 100,
    platform: rows[0].platform_pct / 100,
    growth:   rows[0].growth_pct   / 100,
  };
}

// ── Core distribution logic ───────────────────────────────────────────────────
async function distribute(
  creatorId: string,
  totalGst: number,
  source: string,
  refId: string,
) {
  const split = await splitForCreator(creatorId);
  const txId  = uuidv4();

  const creatorCut  = Math.floor(totalGst * split.creator  * 1e8) / 1e8;
  const agencyCut   = Math.floor(totalGst * split.agency   * 1e8) / 1e8;
  const platformCut = Math.floor(totalGst * split.platform * 1e8) / 1e8;
  const growthCut   = totalGst - creatorCut - agencyCut - platformCut;  // remainder avoids rounding drift

  await db.query(
    `INSERT INTO revenue_distributions
     (id, creator_id, source, ref_id, total_gst,
      creator_gst, agency_gst, platform_gst, growth_gst, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())`,
    [txId, creatorId, source, refId, totalGst,
     creatorCut, agencyCut, platformCut, growthCut],
  );

  // Credit creator treasury
  if (creatorCut > 0) {
    await redis.publish("treasury:credit", JSON.stringify({
      creator_id: creatorId, amount_gst: creatorCut, source, ref_id: txId,
    }));
  }

  // Platform / agency fees are settled in batch via L3 withdrawal queue
  if (agencyCut > 0) {
    await redis.lpush("settlement:agency", JSON.stringify({
      creator_id: creatorId, amount_gst: agencyCut, source, tx_id: txId,
    }));
  }
  if (platformCut > 0) {
    await redis.lpush("settlement:platform", JSON.stringify({
      creator_id: creatorId, amount_gst: platformCut, source, tx_id: txId,
    }));
  }
  if (growthCut > 0) {
    await redis.lpush("settlement:growth", JSON.stringify({
      creator_id: creatorId, amount_gst: growthCut, source, tx_id: txId,
    }));
  }

  return { tx_id: txId, creatorCut, agencyCut, platformCut, growthCut };
}

// ── Redis event subscribers ───────────────────────────────────────────────────
const PAYMENT_CHANNELS = [
  "payment:membership",
  "payment:membership_renewal",
  "payment:token_buy",
  "payment:token_sell",
  "payment:nft_gift",
  "payment:nft_sale",
  "payment:marketplace_sale",
  "payment:stake",
];

redisSub.subscribe(...PAYMENT_CHANNELS, (err, count) => {
  if (err) console.error("[revenue-distribution] subscribe error", err);
  else console.log(`[revenue-distribution] subscribed to ${count} payment channels`);
});

redisSub.on("message", async (channel, message) => {
  try {
    const payload = JSON.parse(message) as {
      creator_id?: string;
      sender_id?:  string;
      amount_gst?: number;
      price_gst?:  number;
      stream_id?:  string;
      position_id?: string;
      [k: string]: unknown;
    };

    const creatorId = payload.creator_id ?? payload.sender_id;
    const amountGst = payload.amount_gst ?? payload.price_gst ?? 0;
    if (!creatorId || amountGst <= 0) return;

    const refId = (payload.stream_id ?? payload.position_id ?? uuidv4()) as string;
    await distribute(creatorId, amountGst, channel, refId);
  } catch (err) {
    console.error("[revenue-distribution] message handler error", channel, err);
  }
});

// ── REST routes ───────────────────────────────────────────────────────────────

// GET /distribution/:txId — lookup a distribution record
app.get("/distribution/:txId", async (req: Request, res: Response) => {
  try {
    const { rows } = await db.query(
      "SELECT * FROM revenue_distributions WHERE id = $1",
      [req.params.txId],
    );
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch {
    res.status(500).json({ error: "Failed to fetch distribution" });
  }
});

// GET /distribution/creator/:creatorId — recent distributions for a creator
app.get("/distribution/creator/:creatorId", async (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  try {
    const { rows } = await db.query(
      `SELECT * FROM revenue_distributions
       WHERE creator_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [req.params.creatorId, limit],
    );
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to fetch distributions" });
  }
});

// POST /distribute — manual / ad-hoc distribution trigger
const DistributeSchema = z.object({
  creator_id: z.string().uuid(),
  amount_gst: z.number().positive(),
  source:     z.string().max(80),
  ref_id:     z.string().uuid().optional(),
});

app.post("/distribute", async (req: Request, res: Response) => {
  const parsed = DistributeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { creator_id, amount_gst, source, ref_id } = parsed.data;
  try {
    const result = await distribute(creator_id, amount_gst, source, ref_id ?? uuidv4());
    res.status(201).json(result);
  } catch {
    res.status(500).json({ error: "Distribution failed" });
  }
});

// GET /split/:creatorId — view effective split for a creator
app.get("/split/:creatorId", async (req: Request, res: Response) => {
  try {
    const split = await splitForCreator(req.params.creatorId as string);
    res.json({ creator_id: req.params.creatorId, ...split });
  } catch {
    res.status(500).json({ error: "Failed to fetch split config" });
  }
});

// PUT /split/:creatorId — update creator split (governance-controlled, requires auth)
const SplitSchema = z.object({
  creator_pct:  z.number().min(50).max(80),
  agency_pct:   z.number().min(5).max(20),
  platform_pct: z.number().min(5).max(15),
}).refine(
  (d) => d.creator_pct + d.agency_pct + d.platform_pct <= 95,
  "Split proportions must leave at least 5% for growth pool",
);

app.put("/split/:creatorId", async (req: Request, res: Response) => {
  const parsed = SplitSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { creator_pct, agency_pct, platform_pct } = parsed.data;
  const growth_pct = 100 - creator_pct - agency_pct - platform_pct;

  try {
    await db.query(
      `INSERT INTO creator_revenue_splits
       (creator_id, creator_pct, agency_pct, platform_pct, growth_pct, updated_at)
       VALUES ($1,$2,$3,$4,$5,NOW())
       ON CONFLICT (creator_id) DO UPDATE
       SET creator_pct=$2, agency_pct=$3, platform_pct=$4, growth_pct=$5, updated_at=NOW()`,
      [req.params.creatorId, creator_pct, agency_pct, platform_pct, growth_pct],
    );
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to update split" });
  }
});

// GET /health
app.get("/health", (_req: Request, res: Response) =>
  res.json({ service: "revenue-distribution", port: PORT, status: "ok" }),
);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[revenue-distribution]", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => console.log(`[revenue-distribution] listening on :${PORT}`));
export default app;
