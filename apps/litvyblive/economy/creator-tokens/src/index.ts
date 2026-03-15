/**
 * Creator Tokens Service — port 7042
 *
 * Creators launch personal tokens on GhostL3.
 * Fans buy tokens with GST to support creators.
 *
 * Token uses: exclusive streams · governance voting · fan rewards
 *
 * AMM model: simple bonding curve  price = reserve_gst / supply
 * All trades settled on GhostL3 via L3 settlement queue.
 */

import express, { Application, Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import Redis from "ioredis";
import { Pool } from "pg";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";

const PORT = Number(process.env.PORT ?? 7042);
const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
const db = new Pool({ connectionString: process.env.DATABASE_URL });

// Platform fee on token buys/sells: 2%
const TRADE_FEE_PCT = 0.02;
// Min launch reserve (GST) — creator must seed liquidity
const MIN_LAUNCH_RESERVE = 500;

const app: Application = express();
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false }));

// ── Bonding curve helpers ─────────────────────────────────────────────────────
function buyPrice(reserveGst: number, supply: number, tokenAmt: number): number {
  // Linear bonding: price_per_token = reserve / supply
  // Cost ≈ integral from supply to (supply + tokenAmt) of (reserve/supply) ds
  // Simplified: average price * tokenAmt
  if (supply === 0) return tokenAmt; // bootstrap: 1 GST / token
  const avgPrice = reserveGst / supply;
  return avgPrice * tokenAmt * (1 + TRADE_FEE_PCT);
}

function sellReturn(reserveGst: number, supply: number, tokenAmt: number): number {
  if (supply === 0) return 0;
  const avgPrice = reserveGst / supply;
  return avgPrice * tokenAmt * (1 - TRADE_FEE_PCT);
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /tokens — list all creator tokens
app.get("/tokens", async (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  try {
    const { rows } = await db.query(
      `SELECT t.*, u.username AS creator_name
       FROM creator_tokens t JOIN users u ON u.id = t.creator_id
       WHERE t.status = 'active'
       ORDER BY t.market_cap_gst DESC LIMIT $1`,
      [limit],
    );
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to list tokens" });
  }
});

// GET /tokens/:symbol
app.get("/tokens/:symbol", async (req: Request, res: Response) => {
  try {
    const { rows } = await db.query(
      `SELECT t.*, u.username AS creator_name
       FROM creator_tokens t JOIN users u ON u.id = t.creator_id
       WHERE UPPER(t.symbol) = UPPER($1)`,
      [req.params.symbol],
    );
    if (!rows[0]) return res.status(404).json({ error: "Token not found" });
    res.json(rows[0]);
  } catch {
    res.status(500).json({ error: "Failed to fetch token" });
  }
});

// POST /tokens/launch — creator launches their personal token
const LaunchSchema = z.object({
  creator_id:    z.string().uuid(),
  name:          z.string().min(2).max(40),
  symbol:        z.string().min(2).max(8).regex(/^[A-Z]+$/, "Symbol must be uppercase letters only"),
  total_supply:  z.number().int().min(100_000).max(1_000_000_000),
  seed_gst:      z.number().min(MIN_LAUNCH_RESERVE),  // creator seeds initial reserve
  description:   z.string().max(300).optional(),
});

app.post("/tokens/launch", async (req: Request, res: Response) => {
  const parsed = LaunchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { creator_id, name, symbol, total_supply, seed_gst, description } = parsed.data;
  try {
    const { rows: dup } = await db.query(
      `SELECT id FROM creator_tokens WHERE UPPER(symbol) = UPPER($1)`, [symbol],
    );
    if (dup.length) return res.status(409).json({ error: "Symbol already taken" });

    const id = uuidv4();
    const initialPrice = seed_gst / total_supply;

    await db.query(
      `INSERT INTO creator_tokens
       (id, creator_id, name, symbol, total_supply, circulating_supply,
        reserve_gst, market_cap_gst, price_gst, description, status, launched_at)
       VALUES ($1,$2,$3,$4,$5,0,$6,$7,$8,$9,'active',NOW())`,
      [id, creator_id, name, symbol.toUpperCase(), total_supply,
       seed_gst, seed_gst, initialPrice, description ?? null],
    );

    // Debit seed GST from creator treasury
    await redis.publish("treasury:debit", JSON.stringify({
      creator_id, amount_gst: seed_gst, reason: "token_launch_seed", ref_id: id,
    }));

    // Mint all supply to creator initially
    await db.query(
      `INSERT INTO token_balances (token_id, user_id, balance, updated_at)
       VALUES ($1,$2,$3,NOW())`,
      [id, creator_id, total_supply],
    );

    await redis.publish("l3:token:launch", JSON.stringify({ token_id: id, symbol, creator_id, total_supply }));

    res.status(201).json({ token_id: id, symbol: symbol.toUpperCase(), initial_price_gst: initialPrice });
  } catch {
    res.status(500).json({ error: "Failed to launch token" });
  }
});

// POST /tokens/:symbol/buy — fan buys creator tokens with GST
const TradeSchema = z.object({
  buyer_id:   z.string().uuid(),
  token_amt:  z.number().positive(),
});

app.post("/tokens/:symbol/buy", async (req: Request, res: Response) => {
  const parsed = TradeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { buyer_id, token_amt } = parsed.data;
  const sym = (req.params.symbol as string).toUpperCase();

  try {
    const { rows } = await db.query(
      `SELECT * FROM creator_tokens WHERE UPPER(symbol) = $1 AND status = 'active' FOR UPDATE`,
      [sym],
    );
    if (!rows[0]) return res.status(404).json({ error: "Token not found" });
    const token = rows[0];

    const available = token.total_supply - token.circulating_supply;
    if (token_amt > available)
      return res.status(409).json({ error: "Not enough supply", available });

    const cost = buyPrice(token.reserve_gst, token.circulating_supply, token_amt);
    const fee  = cost * TRADE_FEE_PCT;

    const newReserve     = token.reserve_gst + (cost - fee);
    const newCirculating = token.circulating_supply + token_amt;
    const newPrice       = newReserve / newCirculating;

    await db.query(
      `UPDATE creator_tokens
       SET circulating_supply = $1, reserve_gst = $2, price_gst = $3,
           market_cap_gst = $3 * $4, updated_at = NOW()
       WHERE id = $5`,
      [newCirculating, newReserve, newPrice, newCirculating, token.id],
    );

    await db.query(
      `INSERT INTO token_balances (token_id, user_id, balance, updated_at)
       VALUES ($1,$2,$3,NOW())
       ON CONFLICT (token_id, user_id) DO UPDATE
         SET balance = token_balances.balance + EXCLUDED.balance, updated_at = NOW()`,
      [token.id, buyer_id, token_amt],
    );

    const txId = uuidv4();
    await db.query(
      `INSERT INTO token_trades (id, token_id, user_id, type, token_amt, gst_amt, fee_gst, price_gst, created_at)
       VALUES ($1,$2,$3,'buy',$4,$5,$6,$7,NOW())`,
      [txId, token.id, buyer_id, token_amt, cost, fee, newPrice],
    );

    // Charge buyer GST; credit platform fee
    await redis.publish("payment:token_buy", JSON.stringify({
      buyer_id, creator_id: token.creator_id, token_id: token.id,
      gst_amt: cost, fee_gst: fee, symbol: sym,
    }));

    res.json({ tx_id: txId, token_amt, gst_cost: cost, fee_gst: fee, new_price_gst: newPrice });
  } catch {
    res.status(500).json({ error: "Failed to buy tokens" });
  }
});

// POST /tokens/:symbol/sell — fan sells tokens back for GST
app.post("/tokens/:symbol/sell", async (req: Request, res: Response) => {
  const parsed = TradeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { buyer_id: seller_id, token_amt } = parsed.data;
  const sym = (req.params.symbol as string).toUpperCase();

  try {
    const { rows } = await db.query(
      `SELECT * FROM creator_tokens WHERE UPPER(symbol) = $1 AND status = 'active' FOR UPDATE`,
      [sym],
    );
    if (!rows[0]) return res.status(404).json({ error: "Token not found" });
    const token = rows[0];

    const { rows: bal } = await db.query(
      `SELECT balance FROM token_balances WHERE token_id = $1 AND user_id = $2`,
      [token.id, seller_id],
    );
    if (!bal[0] || bal[0].balance < token_amt)
      return res.status(409).json({ error: "Insufficient token balance" });

    const returnGst = sellReturn(token.reserve_gst, token.circulating_supply, token_amt);
    const fee       = returnGst * TRADE_FEE_PCT;
    const net       = returnGst - fee;

    const newCirculating = token.circulating_supply - token_amt;
    const newReserve     = token.reserve_gst - returnGst;
    const newPrice       = newCirculating > 0 ? newReserve / newCirculating : 0;

    await db.query(
      `UPDATE creator_tokens
       SET circulating_supply = $1, reserve_gst = $2, price_gst = $3,
           market_cap_gst = $3 * $1, updated_at = NOW()
       WHERE id = $4`,
      [newCirculating, newReserve, newPrice, token.id],
    );

    await db.query(
      `UPDATE token_balances SET balance = balance - $1, updated_at = NOW()
       WHERE token_id = $2 AND user_id = $3`,
      [token_amt, token.id, seller_id],
    );

    const txId = uuidv4();
    await db.query(
      `INSERT INTO token_trades (id, token_id, user_id, type, token_amt, gst_amt, fee_gst, price_gst, created_at)
       VALUES ($1,$2,$3,'sell',$4,$5,$6,$7,NOW())`,
      [txId, token.id, seller_id, token_amt, net, fee, newPrice],
    );

    await redis.publish("payment:token_sell", JSON.stringify({
      seller_id, token_id: token.id, net_gst: net, fee_gst: fee, symbol: sym,
    }));

    res.json({ tx_id: txId, token_amt, gst_received: net, fee_gst: fee, new_price_gst: newPrice });
  } catch {
    res.status(500).json({ error: "Failed to sell tokens" });
  }
});

// GET /tokens/:symbol/holders
app.get("/tokens/:symbol/holders", async (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 500);
  try {
    const { rows } = await db.query(
      `SELECT tb.user_id, u.username, tb.balance,
              ROUND(tb.balance * 100.0 / t.total_supply, 2) AS pct
       FROM token_balances tb
       JOIN creator_tokens t ON t.id = tb.token_id
       JOIN users u ON u.id = tb.user_id
       WHERE UPPER(t.symbol) = UPPER($1) AND tb.balance > 0
       ORDER BY tb.balance DESC LIMIT $2`,
      [req.params.symbol, limit],
    );
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to fetch holders" });
  }
});

// GET /tokens/:symbol/trades — trade history
app.get("/tokens/:symbol/trades", async (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  try {
    const { rows } = await db.query(
      `SELECT tr.* FROM token_trades tr
       JOIN creator_tokens t ON t.id = tr.token_id
       WHERE UPPER(t.symbol) = UPPER($1)
       ORDER BY tr.created_at DESC LIMIT $2`,
      [req.params.symbol, limit],
    );
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to fetch trades" });
  }
});

// GET /health
app.get("/health", (_req: Request, res: Response) =>
  res.json({ service: "creator-tokens", port: PORT, status: "ok" }),
);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[creator-tokens]", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => console.log(`[creator-tokens] listening on :${PORT}`));
export default app;
