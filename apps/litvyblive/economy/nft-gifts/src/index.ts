/**
 * NFT Gifts Service — port 7043
 *
 * Premium gifts are minted as NFTs on GhostL3 and owned by the creator.
 * NFTs are tradable on the creator marketplace.
 *
 * Gift catalog: Golden Crown · Dragon Flame · Ghost Diamond · etc.
 * All NFT minting and transfers go through the L3 NFT settlement queue.
 */

import express, { Application, Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import Redis from "ioredis";
import { Pool } from "pg";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";

const PORT = Number(process.env.PORT ?? 7043);
const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
const db = new Pool({ connectionString: process.env.DATABASE_URL });

const app: Application = express();
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false }));

// ── NFT Gift catalog ─────────────────────────────────────────────────────────
const GIFT_CATALOG: Record<string, { name: string; price_gst: number; rarity: string; animation: string }> = {
  golden_crown:  { name: "Golden Crown",  price_gst: 500,  rarity: "rare",      animation: "crown_spin" },
  dragon_flame:  { name: "Dragon Flame",  price_gst: 1000, rarity: "epic",      animation: "dragon_breath" },
  ghost_diamond: { name: "Ghost Diamond", price_gst: 5000, rarity: "legendary", animation: "ghost_sparkle" },
  star_burst:    { name: "Star Burst",    price_gst: 200,  rarity: "uncommon",  animation: "star_burst" },
  love_storm:    { name: "Love Storm",    price_gst: 100,  rarity: "common",    animation: "hearts" },
  galaxy_wave:   { name: "Galaxy Wave",   price_gst: 2000, rarity: "epic",      animation: "galaxy_wave" },
  thunder_king:  { name: "Thunder King",  price_gst: 3000, rarity: "legendary", animation: "lightning" },
};

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /nft/catalog — available NFT gift types
app.get("/nft/catalog", (_req: Request, res: Response) =>
  res.json(
    Object.entries(GIFT_CATALOG).map(([id, info]) => ({ id, ...info })),
  ),
);

// POST /nft/mint — viewer sends an NFT gift to a creator
const MintSchema = z.object({
  sender_id:   z.string().uuid(),
  creator_id:  z.string().uuid(),
  stream_id:   z.string().uuid().optional(),
  gift_type:   z.string().refine((g) => g in GIFT_CATALOG, "Unknown gift type"),
  message:     z.string().max(200).optional(),
});

app.post("/nft/mint", async (req: Request, res: Response) => {
  const parsed = MintSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { sender_id, creator_id, stream_id, gift_type, message } = parsed.data;
  const gift = GIFT_CATALOG[gift_type];
  const tokenId = uuidv4();

  try {
    // Build on-chain metadata
    const metadata = {
      name:        gift.name,
      description: `${gift.name} NFT gift — LitVybzLive`,
      gift_type,
      rarity:      gift.rarity,
      animation:   gift.animation,
      minted_at:   new Date().toISOString(),
      sender_id,
      creator_id,
      stream_id:   stream_id ?? null,
      message:     message ?? null,
    };

    await db.query(
      `INSERT INTO nft_gifts
       (id, token_id, sender_id, creator_id, stream_id, gift_type, price_gst,
        rarity, metadata, owner_id, status, minted_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'minted',NOW())`,
      [uuidv4(), tokenId, sender_id, creator_id, stream_id ?? null,
       gift_type, gift.price_gst, gift.rarity, JSON.stringify(metadata), creator_id],
    );

    // Charge sender GST via revenue-distribution
    await redis.publish("payment:nft_gift", JSON.stringify({
      sender_id, creator_id, gift_type, amount_gst: gift.price_gst,
      token_id: tokenId, stream_id: stream_id ?? null,
    }));

    // Dispatch L3 NFT mint
    await redis.lpush("l3:nft:mint_queue", JSON.stringify({
      token_id: tokenId, owner: creator_id, metadata,
    }));

    // Live event for the stream UI
    if (stream_id) {
      await redis.publish(`stream:events:${stream_id}`, JSON.stringify({
        type: "nft_gift", sender_id, gift_type, gift_name: gift.name,
        rarity: gift.rarity, token_id: tokenId,
      }));
    }

    res.status(201).json({
      token_id:  tokenId,
      gift_type,
      gift_name: gift.name,
      rarity:    gift.rarity,
      price_gst: gift.price_gst,
    });
  } catch {
    res.status(500).json({ error: "Failed to mint NFT gift" });
  }
});

// GET /nft/:tokenId — get NFT details
app.get("/nft/:tokenId", async (req: Request, res: Response) => {
  try {
    const { rows } = await db.query(
      `SELECT n.*, u.username AS owner_name
       FROM nft_gifts n LEFT JOIN users u ON u.id = n.owner_id
       WHERE n.token_id = $1`,
      [req.params.tokenId],
    );
    if (!rows[0]) return res.status(404).json({ error: "NFT not found" });
    res.json({ ...rows[0], metadata: JSON.parse(rows[0].metadata) });
  } catch {
    res.status(500).json({ error: "Failed to fetch NFT" });
  }
});

// GET /nft/creator/:creatorId — creator's received NFT collection
app.get("/nft/creator/:creatorId", async (req: Request, res: Response) => {
  const rarity = req.query.rarity as string | undefined;
  const limit  = Math.min(Number(req.query.limit ?? 50), 200);
  try {
    const { rows } = await db.query(
      `SELECT n.token_id, n.gift_type, n.rarity, n.price_gst, n.status, n.minted_at,
              u.username AS sender_name
       FROM nft_gifts n LEFT JOIN users u ON u.id = n.sender_id
       WHERE n.creator_id = $1 ${rarity ? "AND n.rarity = $3" : ""}
       ORDER BY n.minted_at DESC LIMIT $2`,
      rarity ? [req.params.creatorId, limit, rarity] : [req.params.creatorId, limit],
    );
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to fetch creator NFTs" });
  }
});

// POST /nft/transfer — owner transfers/trades an NFT to another user
const TransferSchema = z.object({
  token_id:     z.string().uuid(),
  from_user_id: z.string().uuid(),
  to_user_id:   z.string().uuid(),
  price_gst:    z.number().min(0).optional(),   // 0 = gift, >0 = sale via marketplace
});

app.post("/nft/transfer", async (req: Request, res: Response) => {
  const parsed = TransferSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { token_id, from_user_id, to_user_id, price_gst } = parsed.data;
  try {
    const { rows, rowCount } = await db.query(
      `UPDATE nft_gifts SET owner_id = $1, status = 'transferred', transferred_at = NOW()
       WHERE token_id = $2 AND owner_id = $3
       RETURNING id`,
      [to_user_id, token_id, from_user_id],
    );
    if (!rowCount) return res.status(404).json({ error: "NFT not found or not owned by sender" });

    await db.query(
      `INSERT INTO nft_transfers (id, nft_id, from_user_id, to_user_id, price_gst, created_at)
       VALUES ($1,$2,$3,$4,$5,NOW())`,
      [uuidv4(), rows[0].id, from_user_id, to_user_id, price_gst ?? 0],
    );

    // If it's a sale, trigger payment
    if (price_gst && price_gst > 0) {
      await redis.publish("payment:nft_sale", JSON.stringify({
        token_id, buyer_id: to_user_id, seller_id: from_user_id, price_gst,
      }));
    }

    await redis.lpush("l3:nft:transfer_queue", JSON.stringify({ token_id, to_user_id }));
    res.json({ ok: true, token_id, new_owner: to_user_id });
  } catch {
    res.status(500).json({ error: "Failed to transfer NFT" });
  }
});

// GET /nft/user/:userId — all NFTs owned by a user
app.get("/nft/user/:userId", async (req: Request, res: Response) => {
  try {
    const { rows } = await db.query(
      `SELECT token_id, gift_type, rarity, price_gst, status, minted_at
       FROM nft_gifts WHERE owner_id = $1 ORDER BY minted_at DESC LIMIT 200`,
      [req.params.userId],
    );
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to fetch user NFTs" });
  }
});

// GET /health
app.get("/health", (_req: Request, res: Response) =>
  res.json({ service: "nft-gifts", port: PORT, status: "ok" }),
);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[nft-gifts]", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => console.log(`[nft-gifts] listening on :${PORT}`));
export default app;
