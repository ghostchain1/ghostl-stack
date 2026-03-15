import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { getDb } from '../db/index.js';
import { AuthRequest } from '../middleware/auth.js';

export const walletRouter = Router();

const GHOST_L3_CHAIN_ID = 903;

walletRouter.get('/balance', (req: AuthRequest, res) => {
  const db = getDb();
  const user = db
    .prepare('SELECT gst_balance, staked_gst FROM users WHERE id=?')
    .get(req.userId!) as { gst_balance: number; staked_gst: number } | undefined;
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }
  res.json({
    gstBalance: user.gst_balance,
    stakedGst: user.staked_gst,
    coinsBalance: 0, // off-chain coin ledger TBD
    diamondsBalance: 0,
    pendingRewards: 0,
    chainId: GHOST_L3_CHAIN_ID,
  });
});

const withdrawSchema = z.object({
  amount: z.number().positive(),
  toAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  chainId: z.literal(GHOST_L3_CHAIN_ID), // GhostL3 only
});

walletRouter.post('/withdraw', (req: AuthRequest, res) => {
  const parsed = withdrawSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const { amount, toAddress } = parsed.data;
  const db = getDb();
  const user = db
    .prepare('SELECT gst_balance FROM users WHERE id=?')
    .get(req.userId!) as { gst_balance: number } | undefined;
  if (!user || user.gst_balance < amount) {
    res.status(400).json({ error: 'Insufficient GST balance' });
    return;
  }
  db.prepare('UPDATE users SET gst_balance = gst_balance - ? WHERE id=?').run(amount, req.userId!);
  const txId = uuid();
  db.prepare(
    'INSERT INTO wallet_transactions (id, user_id, type, amount_gst, chain_id, created_at) VALUES (?,?,?,?,?,?)',
  ).run(txId, req.userId!, 'withdraw', amount, GHOST_L3_CHAIN_ID, new Date().toISOString());
  // Forward to microtx engine / settlement service for on-chain dispatch
  res.json({ id: txId, toAddress, amount, chainId: GHOST_L3_CHAIN_ID, status: 'queued' });
});

walletRouter.post('/stake', (req: AuthRequest, res) => {
  const parsed = z
    .object({ amount: z.number().positive(), chainId: z.literal(GHOST_L3_CHAIN_ID) })
    .safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const { amount } = parsed.data;
  const db = getDb();
  const user = db
    .prepare('SELECT gst_balance FROM users WHERE id=?')
    .get(req.userId!) as { gst_balance: number } | undefined;
  if (!user || user.gst_balance < amount) {
    res.status(400).json({ error: 'Insufficient GST balance' });
    return;
  }
  db.prepare(
    'UPDATE users SET gst_balance = gst_balance - ?, staked_gst = staked_gst + ? WHERE id=?',
  ).run(amount, amount, req.userId!);
  res.json({ success: true, stakedAmount: amount });
});

walletRouter.get('/treasury/:userId', (req, res) => {
  const db = getDb();
  const user = db
    .prepare('SELECT gst_balance, staked_gst FROM users WHERE id=?')
    .get(req.params['userId']) as { gst_balance: number; staked_gst: number } | undefined;
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }
  res.json({
    vaultBalance: user.gst_balance,
    stakedBalance: user.staked_gst,
    pendingRewards: 0,
    chainId: GHOST_L3_CHAIN_ID,
  });
});
