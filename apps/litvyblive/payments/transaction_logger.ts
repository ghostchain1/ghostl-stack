/**
 * Transaction Logger
 *
 * Persists every payment transaction to the DB for auditing, GhostBrain
 * analysis, and compliance reporting.
 *
 * Tables used:
 *   payment_transactions — one row per completed/failed payment attempt
 *   payment_audit_log    — append-only event log (state changes)
 */

import { v4 as uuid } from 'uuid';
import { getDb }      from '../backend/src/db/index.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type PaymentMethod =
  | 'credit_card'
  | 'apple_pay'
  | 'google_pay'
  | 'bank_transfer'
  | 'crypto_wallet';

export type PaymentStatus =
  | 'pending'
  | 'processing'
  | 'confirmed'
  | 'failed'
  | 'refunded'
  | 'flagged';

export type FiatCurrency = 'USD' | 'EUR' | 'GBP' | 'JPY' | 'CAD' | 'AUD';

export interface PaymentTransaction {
  tx_id:           string;
  user_id:         string;
  wallet_address:  string;
  payment_method:  PaymentMethod;
  fiat_amount:     number;
  fiat_currency:   FiatCurrency;
  usd_amount:      number;
  gst_amount:      number;
  gst_rate:        number;
  provider_ref:    string | null;   // external payment provider reference
  chain_tx_hash:   string | null;   // GhostL3 transaction hash
  status:          PaymentStatus;
  fraud_score:     number;          // 0–100 (GhostBrain score)
  flagged_reason:  string | null;
  created_at:      string;
  updated_at:      string;
}

// ── Create ────────────────────────────────────────────────────────────────────

export function createTransaction(params: {
  userId:         string;
  walletAddress:  string;
  paymentMethod:  PaymentMethod;
  fiatAmount:     number;
  fiatCurrency:   FiatCurrency;
  usdAmount:      number;
  gstAmount:      number;
  gstRate:        number;
  providerRef?:   string;
}): PaymentTransaction {
  const db  = getDb();
  const id  = uuid();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO payment_transactions
      (tx_id, user_id, wallet_address, payment_method, fiat_amount, fiat_currency,
       usd_amount, gst_amount, gst_rate, provider_ref, chain_tx_hash,
       status, fraud_score, flagged_reason, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'pending', 0, NULL, ?, ?)
  `).run(
    id,
    params.userId,
    params.walletAddress,
    params.paymentMethod,
    params.fiatAmount,
    params.fiatCurrency,
    params.usdAmount,
    params.gstAmount,
    params.gstRate,
    params.providerRef ?? null,
    now, now
  );

  appendAuditLog(id, 'created', 'pending', { source: params.paymentMethod });
  return getTransaction(id)!;
}

// ── Update status ─────────────────────────────────────────────────────────────

export function updateTransactionStatus(
  txId:      string,
  status:    PaymentStatus,
  extra?: {
    chainTxHash?:   string;
    fraudScore?:    number;
    flaggedReason?: string;
  }
): PaymentTransaction {
  const db  = getDb();
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE payment_transactions
    SET status          = ?,
        chain_tx_hash   = COALESCE(?, chain_tx_hash),
        fraud_score     = COALESCE(?, fraud_score),
        flagged_reason  = COALESCE(?, flagged_reason),
        updated_at      = ?
    WHERE tx_id = ?
  `).run(
    status,
    extra?.chainTxHash   ?? null,
    extra?.fraudScore    ?? null,
    extra?.flaggedReason ?? null,
    now,
    txId
  );

  appendAuditLog(txId, 'status_change', status, extra ?? {});
  const tx = getTransaction(txId);
  if (!tx) throw new Error(`Transaction ${txId} not found`);
  return tx;
}

// ── Query ─────────────────────────────────────────────────────────────────────

export function getTransaction(txId: string): PaymentTransaction | null {
  return getDb()
    .prepare('SELECT * FROM payment_transactions WHERE tx_id = ?')
    .get(txId) as PaymentTransaction | null;
}

export function getUserTransactions(
  userId: string,
  limit   = 50
): PaymentTransaction[] {
  return getDb()
    .prepare(`
      SELECT * FROM payment_transactions
      WHERE user_id = ? ORDER BY created_at DESC LIMIT ?
    `)
    .all(userId, limit) as PaymentTransaction[];
}

export function listTransactions(opts: {
  status?:  PaymentStatus;
  method?:  PaymentMethod;
  flagged?: boolean;
  limit?:   number;
}): PaymentTransaction[] {
  const db = getDb();
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (opts.status)  { conditions.push('status = ?');         params.push(opts.status); }
  if (opts.method)  { conditions.push('payment_method = ?'); params.push(opts.method); }
  if (opts.flagged) { conditions.push("status = 'flagged'"); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(opts.limit ?? 100);

  return db
    .prepare(`SELECT * FROM payment_transactions ${where} ORDER BY created_at DESC LIMIT ?`)
    .all(...params) as PaymentTransaction[];
}

// ── Audit log ─────────────────────────────────────────────────────────────────

export function appendAuditLog(
  txId:    string,
  event:   string,
  status:  string,
  meta:    Record<string, unknown>
): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO payment_audit_log (log_id, tx_id, event, status, meta, logged_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(uuid(), txId, event, status, JSON.stringify(meta), new Date().toISOString());
}

export function getAuditLog(txId: string): {
  log_id:    string;
  tx_id:     string;
  event:     string;
  status:    string;
  meta:      string;
  logged_at: string;
}[] {
  return getDb()
    .prepare('SELECT * FROM payment_audit_log WHERE tx_id = ? ORDER BY logged_at ASC')
    .all(txId) as { log_id: string; tx_id: string; event: string; status: string; meta: string; logged_at: string }[];
}

// ── Platform stats (admin) ────────────────────────────────────────────────────

export function paymentStats(fromDate: string, toDate: string): {
  totalTransactions: number;
  totalUSD:          number;
  totalGST:          number;
  byMethod:          Record<string, number>;
  flaggedCount:      number;
  failedCount:       number;
} {
  const db = getDb();

  const row = db.prepare(`
    SELECT
      COUNT(*)                             as total,
      COALESCE(SUM(usd_amount), 0)         as usd,
      COALESCE(SUM(gst_amount), 0)         as gst,
      SUM(status = 'flagged')              as flagged,
      SUM(status = 'failed')               as failed
    FROM payment_transactions
    WHERE created_at BETWEEN ? AND ?
  `).get(fromDate, toDate) as { total: number; usd: number; gst: number; flagged: number; failed: number };

  const methodRows = db.prepare(`
    SELECT payment_method, COUNT(*) as cnt
    FROM payment_transactions
    WHERE created_at BETWEEN ? AND ?
    GROUP BY payment_method
  `).all(fromDate, toDate) as { payment_method: string; cnt: number }[];

  const byMethod: Record<string, number> = {};
  for (const m of methodRows) byMethod[m.payment_method] = m.cnt;

  return {
    totalTransactions: row.total,
    totalUSD:          row.usd,
    totalGST:          row.gst,
    byMethod,
    flaggedCount:      row.flagged,
    failedCount:       row.failed,
  };
}
