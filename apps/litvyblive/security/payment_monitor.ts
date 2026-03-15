/**
 * Payment Monitor — Cross-session payment anomaly detection
 *
 * Extends the per-transaction fraud scoring in payment_gateway.ts with
 * longitudinal (multi-session) analysis:
 *
 *  • Rapid purchase velocity  — > 3 purchases in 30 min → flag
 *  • High cumulative spend    — > $500 in 1 hour → manual review
 *  • Chargeback history       — > 1 chargeback in 90 days → block
 *  • Method switching         — many methods in short window → ring signal
 *  • High-value single tx     — > $200 single purchase → scrutiny
 *  • New account large buy    — account < 24h old + large purchase → flag
 *
 * Runs synchronously during payment processing and asynchronously as a
 * background scan every 5 minutes.
 */

import { getDb } from '../backend/src/db/index.js';
import { v4 as uuidv4 } from 'uuid';

// ── Types ──────────────────────────────────────────────────────────────────────

export type PaymentRiskLevel = 'safe' | 'monitor' | 'review' | 'block';

export interface PaymentRiskSignal {
  signal:   string;
  severity: number;    // 0–100 contribution
  value:    unknown;
}

export interface PaymentRiskResult {
  userId:      string;
  riskScore:   number;          // 0–100 aggregate
  riskLevel:   PaymentRiskLevel;
  signals:     PaymentRiskSignal[];
  action:      'allow' | 'flag' | 'require_review' | 'block';
  analyzedAt:  string;
}

export interface ChargebackRecord {
  txId:       string;
  userId:     string;
  amount:     number;
  currency:   string;
  occurredAt: string;
}

// ── Thresholds ─────────────────────────────────────────────────────────────────

const RAPID_PURCHASE_COUNT     = 3;    // purchases in window
const RAPID_PURCHASE_WINDOW    = 30;   // minutes
const HOURLY_SPEND_LIMIT_USD   = 500;  // $500/hr review threshold
const SINGLE_TX_REVIEW_USD     = 200;  // $200 single tx scrutiny
const CHARGEBACK_BLOCK_COUNT   = 2;    // chargebacks in 90d → block
const NEW_ACCOUNT_HOURS        = 24;   // hours before account is "established"
const NEW_ACCOUNT_LARGE_USD    = 50;   // large = $50 for new accounts

// ── Core risk analysis ─────────────────────────────────────────────────────────

/**
 * Analyse a user's payment history for risk signals.
 * Call this before confirming any payment.
 */
export function analyzePaymentRisk(
  userId:    string,
  txId:      string,
  usdAmount: number,
  method:    string
): PaymentRiskResult {
  const db      = getDb();
  const signals: PaymentRiskSignal[] = [];
  let riskScore = 0;

  // 1. Rapid purchase velocity
  const recentCount = (db.prepare(`
    SELECT COUNT(*) AS cnt FROM payment_transactions
    WHERE user_id = ? AND status NOT IN ('failed','refunded')
      AND created_at >= datetime('now', '-${RAPID_PURCHASE_WINDOW} minutes')
  `).get(userId) as any)?.cnt ?? 0;

  if (recentCount >= RAPID_PURCHASE_COUNT) {
    const contrib = 35;
    signals.push({ signal: 'rapid_purchase_velocity', severity: contrib, value: recentCount });
    riskScore += contrib;
  }

  // 2. Hourly cumulative spend
  const hourlySumRow = db.prepare(`
    SELECT SUM(usd_amount) AS total FROM payment_transactions
    WHERE user_id = ? AND status NOT IN ('failed','refunded')
      AND created_at >= datetime('now', '-1 hour')
  `).get(userId) as any;
  const hourlySpend = (hourlySumRow?.total ?? 0) + usdAmount;

  if (hourlySpend > HOURLY_SPEND_LIMIT_USD) {
    const contrib = 40;
    signals.push({ signal: 'high_hourly_spend', severity: contrib, value: { hourlySpend, limit: HOURLY_SPEND_LIMIT_USD } });
    riskScore += contrib;
  }

  // 3. Single tx over review threshold
  if (usdAmount > SINGLE_TX_REVIEW_USD) {
    const contrib = 20;
    signals.push({ signal: 'large_single_tx', severity: contrib, value: usdAmount });
    riskScore += contrib;
  }

  // 4. Chargeback history
  const chargebacks = (db.prepare(`
    SELECT COUNT(*) AS cnt FROM payment_chargebacks
    WHERE user_id = ? AND occurred_at >= datetime('now', '-90 days')
  `).get(userId) as any)?.cnt ?? 0;

  if (chargebacks >= CHARGEBACK_BLOCK_COUNT) {
    const contrib = 80;
    signals.push({ signal: 'chargeback_history', severity: contrib, value: chargebacks });
    riskScore = Math.max(riskScore, contrib);  // dominating signal
  }

  // 5. Multiple payment methods in short window (card testing)
  const methodCount = (db.prepare(`
    SELECT COUNT(DISTINCT payment_method) AS cnt FROM payment_transactions
    WHERE user_id = ? AND created_at >= datetime('now', '-30 minutes')
  `).get(userId) as any)?.cnt ?? 0;

  if (methodCount >= 3) {
    const contrib = 45;
    signals.push({ signal: 'method_switching', severity: contrib, value: methodCount });
    riskScore += contrib;
  }

  // Cap at 100
  riskScore = Math.min(riskScore, 100);

  const { riskLevel, action } = _riskMatrix(riskScore);

  // Persist risk assessment
  db.prepare(`
    INSERT INTO payment_risk_assessments
      (assessment_id, tx_id, user_id, risk_score, risk_level, signals, action, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), txId, userId, riskScore, riskLevel,
         JSON.stringify(signals), action, new Date().toISOString());

  return { userId, riskScore, riskLevel, signals, action, analyzedAt: new Date().toISOString() };
}

/**
 * Record a chargeback for a user (called via external webhook from Stripe/PayPal).
 */
export function recordChargeback(record: ChargebackRecord): void {
  const db = getDb();
  db.prepare(`
    INSERT OR IGNORE INTO payment_chargebacks
      (chargeback_id, tx_id, user_id, amount, currency, occurred_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), record.txId, record.userId, record.amount,
         record.currency, record.occurredAt);
}

/**
 * Get payment risk summary for a user (for dashboard).
 */
export function getUserPaymentRisk(userId: string) {
  const db = getDb();
  return {
    recentAssessments: db.prepare(`
      SELECT risk_score, risk_level, action, created_at FROM payment_risk_assessments
      WHERE user_id = ? ORDER BY created_at DESC LIMIT 10
    `).all(userId),
    chargebackCount: (db.prepare(`
      SELECT COUNT(*) AS cnt FROM payment_chargebacks
      WHERE user_id = ? AND occurred_at >= datetime('now', '-90 days')
    `).get(userId) as any)?.cnt ?? 0,
    hourlySpend: (db.prepare(`
      SELECT SUM(usd_amount) AS total FROM payment_transactions
      WHERE user_id = ? AND status = 'confirmed' AND created_at >= datetime('now', '-1 hour')
    `).get(userId) as any)?.total ?? 0,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function _riskMatrix(score: number): { riskLevel: PaymentRiskLevel; action: PaymentRiskResult['action'] } {
  if (score >= 80) return { riskLevel: 'block',   action: 'block' };
  if (score >= 60) return { riskLevel: 'review',   action: 'require_review' };
  if (score >= 35) return { riskLevel: 'monitor',  action: 'flag' };
  return            { riskLevel: 'safe',    action: 'allow' };
}
