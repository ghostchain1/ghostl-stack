import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { AuthRequest } from '../middleware/auth.js';
import { io } from '../index.js';

export const giftsRouter = Router();

const GHOST_L3_CHAIN_ID = 903;

const sendSchema = z.object({
  streamId: z.string().uuid(),
  giftId: z.string().max(64),
  giftName: z.string().max(64),
  price: z.number().int().positive(),
  chainId: z.literal(GHOST_L3_CHAIN_ID), // GhostL3 enforced
});

const batchSchema = z.object({
  items: z.array(sendSchema).min(1).max(50),
  chainId: z.literal(GHOST_L3_CHAIN_ID),
});

giftsRouter.post('/send', (req: AuthRequest, res) => {
  const parsed = sendSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const { streamId, giftId, giftName, price } = parsed.data;
  const db = getDb();
  const id = uuid();
  db.prepare(
    'INSERT INTO gifts (id, stream_id, sender_id, gift_id, gift_name, price_gst, chain_id, created_at) VALUES (?,?,?,?,?,?,?,?)',
  ).run(id, streamId, req.userId!, giftId, giftName, price, GHOST_L3_CHAIN_ID, new Date().toISOString());

  // Broadcast gift event to everyone in the stream room
  io.to(streamId).emit('gift', {
    giftId,
    giftName,
    price,
    senderId: req.userId,
    streamId,
  });

  res.json({ id, success: true });
});

giftsRouter.post('/batch', (req: AuthRequest, res) => {
  const parsed = batchSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const db = getDb();
  const insert = db.prepare(
    'INSERT INTO gifts (id, stream_id, sender_id, gift_id, gift_name, price_gst, chain_id, created_at) VALUES (?,?,?,?,?,?,?,?)',
  );
  const now = new Date().toISOString();
  const insertMany = db.transaction((items: typeof parsed.data.items) => {
    for (const g of items) {
      insert.run(uuid(), g.streamId, req.userId!, g.giftId, g.giftName, g.price, GHOST_L3_CHAIN_ID, now);
    }
  });
  insertMany(parsed.data.items);
  res.json({ success: true, count: parsed.data.items.length });
});

giftsRouter.post('/send-onchain', (req: AuthRequest, res) => {
  // On-chain dispatch is handled by the settlement engine; backend records intent.
  const parsed = z
    .object({ streamId: z.string(), giftId: z.string(), priceWei: z.string(), chainId: z.literal(GHOST_L3_CHAIN_ID) })
    .safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const id = uuid();
  const db = getDb();
  // Record pending on-chain settlement intent in wallet_transactions
  db.prepare(
    'INSERT INTO wallet_transactions (id, user_id, type, amount_gst, tx_hash, chain_id, created_at) VALUES (?,?,?,?,?,?,?)',
  ).run(id, req.userId!, 'gift_onchain_pending', Number(parsed.data.priceWei), `0x${id.replace(/-/g, '')}`, GHOST_L3_CHAIN_ID, new Date().toISOString());
  res.json({ id, txHash: `0x${id.replace(/-/g, '')}`, success: true });
});

giftsRouter.get('/history/:userId', (req, res) => {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM gifts WHERE sender_id=? ORDER BY created_at DESC LIMIT 100')
    .all(req.params['userId']);
  res.json(rows);
});
