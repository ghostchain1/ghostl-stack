/**
 * Marketplace — port 7047
 *
 * Peer-to-peer trading of NFT gifts, creator tokens, exclusive content passes,
 * and live event tickets.  All transactions are denominated in GST.
 *
 * Purchase flow:
 *   1. Buyer sends POST /marketplace/buy
 *   2. Marketplace collects GST (via payment:marketplace_sale pub)
 *   3. revenue-distribution splits the payment (creator 70% etc.)
 *   4. NFT/token ownership is transferred via nft-gifts service (Redis pub)
 *   5. Settlement queued on L3 via l3:marketplace:sale list
 */

import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import Redis from "ioredis";
import { Pool } from "pg";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";

const PORT = Number(process.env.PORT ?? 7047);
const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
const db    = new Pool({ connectionString: process.env.DATABASE_URL });

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false }));

// ── Allowed listing item types ────────────────────────────────────────────────
type ItemType = "nft_gift" | "creator_token" | "content_pass" | "event_ticket";
const ITEM_TYPES: ItemType[] = ["nft_gift", "creator_token", "content_pass", "event_ticket"];

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /marketplace — browse listings (paginated)
app.get("/marketplace", async (req: Request, res: Response) => {
  const item_type  = req.query.item_type as ItemType | undefined;
  const creator_id = req.query.creator_id as string | undefined;
  const min_price  = Number(req.query.min_price ?? 0);
  const max_price  = req.query.max_price ? Number(req.query.max_price) : null;
  const limit      = Math.min(Number(req.query.limit ?? 40), 200);
  const offset     = Number(req.query.offset ?? 0);

  try {
    const conditions: string[] = ["ml.status = 'active'", "ml.price_gst >= $1"];
    const params: unknown[]    = [min_price];

    if (item_type)  { params.push(item_type);  conditions.push(`ml.item_type = $${params.length}`); }
    if (creator_id) { params.push(creator_id); conditions.push(`ml.creator_id = $${params.length}`); }
    if (max_price)  { params.push(max_price);  conditions.push(`ml.price_gst <= $${params.length}`); }

    params.push(limit, offset);
    const { rows } = await db.query(
      `SELECT ml.id, ml.item_type, ml.item_id, ml.price_gst, ml.quantity,
              ml.seller_id, ml.creator_id, ml.title, ml.description,
              ml.thumbnail_url, ml.listed_at, u.username AS seller_name
       FROM marketplace_listings ml
       LEFT JOIN users u ON u.id = ml.seller_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY ml.listed_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to fetch listings" });
  }
});

// POST /marketplace/list — create a listing
const ListSchema = z.object({
  seller_id:   z.string().uuid(),
  creator_id:  z.string().uuid(),
  item_type:   z.enum(["nft_gift", "creator_token", "content_pass", "event_ticket"]),
  item_id:     z.string().uuid(),            // token_id, nft id, pass id, etc.
  price_gst:   z.number().positive(),
  quantity:    z.number().int().min(1).max(100).default(1),
  title:       z.string().max(120),
  description: z.string().max(1000).optional(),
  thumbnail_url: z.string().url().optional(),
});

app.post("/marketplace/list", async (req: Request, res: Response) => {
  const parsed = ListSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { seller_id, creator_id, item_type, item_id, price_gst,
          quantity, title, description, thumbnail_url } = parsed.data;

  const listingId = uuidv4();
  try {
    await db.query(
      `INSERT INTO marketplace_listings
       (id, seller_id, creator_id, item_type, item_id, price_gst, quantity,
        title, description, thumbnail_url, status, listed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'active',NOW())`,
      [listingId, seller_id, creator_id, item_type, item_id, price_gst, quantity,
       title, description ?? null, thumbnail_url ?? null],
    );
    res.status(201).json({ listing_id: listingId, price_gst, status: "active" });
  } catch {
    res.status(500).json({ error: "Failed to create listing" });
  }
});

// GET /marketplace/:listingId — listing detail
app.get("/marketplace/:listingId", async (req: Request, res: Response) => {
  try {
    const { rows } = await db.query(
      `SELECT ml.*, u.username AS seller_name
       FROM marketplace_listings ml LEFT JOIN users u ON u.id = ml.seller_id
       WHERE ml.id = $1`,
      [req.params.listingId],
    );
    if (!rows[0]) return res.status(404).json({ error: "Listing not found" });
    res.json(rows[0]);
  } catch {
    res.status(500).json({ error: "Failed to fetch listing" });
  }
});

// POST /marketplace/buy — purchase a listing
const BuySchema = z.object({
  listing_id: z.string().uuid(),
  buyer_id:   z.string().uuid(),
  quantity:   z.number().int().min(1).default(1),
});

app.post("/marketplace/buy", async (req: Request, res: Response) => {
  const parsed = BuySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { listing_id, buyer_id, quantity } = parsed.data;

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const { rows: [listing] } = await client.query(
      `SELECT * FROM marketplace_listings WHERE id = $1 AND status = 'active' FOR UPDATE`,
      [listing_id],
    );
    if (!listing) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Listing not found or inactive" }); }
    if (listing.seller_id === buyer_id) { await client.query("ROLLBACK"); return res.status(400).json({ error: "Cannot purchase your own listing" }); }
    if (listing.quantity < quantity) { await client.query("ROLLBACK"); return res.status(400).json({ error: "Insufficient listing quantity" }); }

    const totalGst = listing.price_gst * quantity;
    const saleId   = uuidv4();

    // Decrement quantity or mark sold
    const newQty = listing.quantity - quantity;
    await client.query(
      `UPDATE marketplace_listings SET quantity = $1, status = $2 WHERE id = $3`,
      [newQty, newQty === 0 ? "sold" : "active", listing_id],
    );

    await client.query(
      `INSERT INTO marketplace_sales
       (id, listing_id, buyer_id, seller_id, creator_id, item_type, item_id,
        quantity, price_gst, total_gst, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())`,
      [saleId, listing_id, buyer_id, listing.seller_id, listing.creator_id,
       listing.item_type, listing.item_id, quantity, listing.price_gst, totalGst],
    );

    await client.query("COMMIT");

    // Trigger payment → revenue-distribution splits it
    await redis.publish("payment:marketplace_sale", JSON.stringify({
      buyer_id, creator_id: listing.creator_id, seller_id: listing.seller_id,
      amount_gst: totalGst, sale_id: saleId, item_type: listing.item_type,
    }));

    // Transfer NFT ownership if applicable
    if (listing.item_type === "nft_gift") {
      await redis.publish("nft:transfer:request", JSON.stringify({
        token_id: listing.item_id,
        from_user_id: listing.seller_id,
        to_user_id: buyer_id,
        price_gst: totalGst,
      }));
    }

    // L3 settlement record
    await redis.lpush("l3:marketplace:sale", JSON.stringify({
      sale_id: saleId, buyer_id, seller_id: listing.seller_id,
      item_type: listing.item_type, total_gst: totalGst,
    }));

    res.status(200).json({ ok: true, sale_id: saleId, total_gst: totalGst });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[marketplace] buy error", err);
    res.status(500).json({ error: "Purchase failed" });
  } finally {
    client.release();
  }
});

// GET /marketplace/creator/:creatorId — creator's active listings
app.get("/marketplace/creator/:creatorId", async (req: Request, res: Response) => {
  const status = (req.query.status as string) ?? "active";
  try {
    const { rows } = await db.query(
      `SELECT ml.id, ml.item_type, ml.item_id, ml.price_gst, ml.quantity,
              ml.title, ml.status, ml.listed_at
       FROM marketplace_listings ml
       WHERE ml.creator_id = $1 AND ml.status = $2
       ORDER BY ml.listed_at DESC LIMIT 100`,
      [req.params.creatorId, status],
    );
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to fetch creator listings" });
  }
});

// DELETE /marketplace/listing/:id — delist an item (seller only)
const DelistSchema = z.object({ seller_id: z.string().uuid() });

app.delete("/marketplace/listing/:id", async (req: Request, res: Response) => {
  const parsed = DelistSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const { rowCount } = await db.query(
      `UPDATE marketplace_listings SET status = 'delisted'
       WHERE id = $1 AND seller_id = $2 AND status = 'active'`,
      [req.params.id, parsed.data.seller_id],
    );
    if (!rowCount) return res.status(404).json({ error: "Active listing not found" });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to delist" });
  }
});

// GET /marketplace/sales/:userId — purchase history
app.get("/marketplace/sales/:userId", async (req: Request, res: Response) => {
  const role  = (req.query.role as "buyer" | "seller") ?? "buyer";
  const field = role === "seller" ? "seller_id" : "buyer_id";
  try {
    const { rows } = await db.query(
      `SELECT ms.*, ml.title FROM marketplace_sales ms
       LEFT JOIN marketplace_listings ml ON ml.id = ms.listing_id
       WHERE ms.${field} = $1 ORDER BY ms.created_at DESC LIMIT 100`,
      [req.params.userId],
    );
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to fetch sale history" });
  }
});

// GET /health
app.get("/health", (_req: Request, res: Response) =>
  res.json({ service: "marketplace", port: PORT, status: "ok" }),
);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[marketplace]", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => console.log(`[marketplace] listening on :${PORT}`));
export default app;
