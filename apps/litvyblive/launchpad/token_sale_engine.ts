/**
 * Token Sale Engine — off-chain state tracking for on-chain TokenSaleEngine.sol.
 * Records sales, purchases, and proceeds claim status in SQLite.
 */

import { getDb } from '../backend/src/db/index.js';

export interface TokenSaleRecord {
  id: string;             // bytes32 saleId (hex)
  token_id: string;       // references creator_tokens.id
  creator_id: string;
  price_gst: number;      // GST per 1 fan-token
  total_for_sale: number;
  sold: number;
  proceeds_claimed: number;
  starts_at: string;
  ends_at: string;
  chain_sale_id: string | null; // bytes32 saleId on-chain
  created_at: string;
}

export interface PurchaseRecord {
  id: string;
  sale_id: string;
  buyer_id: string;
  buyer_wallet: string;
  amount: number;
  gst_spent: number;
  tx_hash: string | null;
  created_at: string;
}

// ── Sales ─────────────────────────────────────────────────────────────────────

export function createSale(params: {
  id: string;
  tokenId: string;
  creatorId: string;
  priceGst: number;
  totalForSale: number;
  startsAt: string;
  endsAt: string;
  chainSaleId?: string;
}): TokenSaleRecord {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO token_sales
       (id, token_id, creator_id, price_gst, total_for_sale, sold, proceeds_claimed,
        starts_at, ends_at, chain_sale_id, created_at)
     VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?)`,
  ).run(
    params.id,
    params.tokenId,
    params.creatorId,
    params.priceGst,
    params.totalForSale,
    params.startsAt,
    params.endsAt,
    params.chainSaleId ?? null,
    now,
  );
  return getSaleById(params.id)!;
}

export function getSaleById(id: string): TokenSaleRecord | null {
  const db = getDb();
  return (db.prepare('SELECT * FROM token_sales WHERE id=?').get(id) as TokenSaleRecord) ?? null;
}

export function listSalesByToken(tokenId: string): TokenSaleRecord[] {
  const db = getDb();
  return db.prepare('SELECT * FROM token_sales WHERE token_id=? ORDER BY created_at DESC').all(tokenId) as TokenSaleRecord[];
}

export function listActiveSales(): TokenSaleRecord[] {
  const db = getDb();
  const now = new Date().toISOString();
  return db
    .prepare('SELECT * FROM token_sales WHERE starts_at<=? AND ends_at>=? ORDER BY starts_at ASC')
    .all(now, now) as TokenSaleRecord[];
}

/** Record a fan purchase (called after on-chain confirmation or optimistically). */
export function recordPurchase(params: {
  id: string;
  saleId: string;
  buyerId: string;
  buyerWallet: string;
  amount: number;
  gstSpent: number;
  txHash?: string;
}): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO token_purchases
       (id, sale_id, buyer_id, buyer_wallet, amount, gst_spent, tx_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(params.id, params.saleId, params.buyerId, params.buyerWallet, params.amount, params.gstSpent, params.txHash ?? null, now);

  // Update sold counter in the sale row
  db.prepare('UPDATE token_sales SET sold = sold + ? WHERE id=?').run(params.amount, params.saleId);

  // Update fan_holdings
  db.prepare(
    `INSERT INTO fan_holdings (user_id, token_id, amount, last_updated)
       SELECT ?, ts.token_id, ?, ?
       FROM token_sales ts WHERE ts.id=?
     ON CONFLICT(user_id, token_id) DO UPDATE SET amount=amount+excluded.amount, last_updated=excluded.last_updated`,
  ).run(params.buyerId, params.amount, now, params.saleId);
}

/** Mark proceeds as claimed, updating the proceeds_claimed total. */
export function markProceedsClaimed(saleId: string, amount: number): void {
  const db = getDb();
  db.prepare('UPDATE token_sales SET proceeds_claimed = proceeds_claimed + ? WHERE id=?').run(amount, saleId);
}

/** Fetch all purchases for a sale — used for analytics and receipts. */
export function listPurchasesBySale(saleId: string): PurchaseRecord[] {
  const db = getDb();
  return db.prepare('SELECT * FROM token_purchases WHERE sale_id=? ORDER BY created_at DESC').all(saleId) as PurchaseRecord[];
}

/** Fetch all purchases by a specific buyer. */
export function listPurchasesByBuyer(buyerId: string): PurchaseRecord[] {
  const db = getDb();
  return db.prepare('SELECT * FROM token_purchases WHERE buyer_id=? ORDER BY created_at DESC').all(buyerId) as PurchaseRecord[];
}
