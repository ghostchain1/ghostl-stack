/**
 * Creator Salary Engine — computes and distributes monthly GST salaries to
 * eligible creators based on their tier (Bronze / Silver / Gold / Elite).
 *
 * Salary payouts are recorded on-chain via the SalaryDistributor L3 contract.
 * Off-chain records live in `salary_payouts` and `salary_cycles` SQLite tables.
 */

import { getDb } from '../backend/src/db/index.js';
import { v4 as uuid } from 'uuid';
import {
  aggregateMetrics,
  resolveCreatorTier,
  TIER_CONFIG,
  type CreatorTier,
} from './creator_metrics.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SalaryCycle {
  cycle_id:    string;
  period_label: string;          // e.g. '2026-03'
  total_gst:   number;
  creators_paid: number;
  status:      'pending' | 'processing' | 'complete';
  started_at:  string;
  completed_at: string | null;
}

export interface SalaryPayout {
  payout_id:    string;
  cycle_id:     string;
  creator_id:   string;
  wallet:       string;
  tier:         CreatorTier;
  amount_gst:   number;
  tx_hash:      string | null;
  status:       'queued' | 'processing' | 'confirmed' | 'failed';
  scheduled_at: string;
  confirmed_at: string | null;
}

// ── Cycle management ───────────────────────────────────────────────────────────

/** Open a new salary cycle for a calendar month (e.g. '2026-03'). */
export function openSalaryCycle(periodLabel: string): SalaryCycle {
  const db  = getDb();
  const id  = uuid();
  const now = new Date().toISOString();

  const existing = db.prepare(
    `SELECT * FROM salary_cycles WHERE period_label = ?`
  ).get(periodLabel) as SalaryCycle | undefined;
  if (existing) return existing;

  db.prepare(`
    INSERT INTO salary_cycles (cycle_id, period_label, total_gst, creators_paid, status, started_at, completed_at)
    VALUES (?, ?, 0, 0, 'pending', ?, NULL)
  `).run(id, periodLabel, now);

  return { cycle_id: id, period_label: periodLabel, total_gst: 0,
           creators_paid: 0, status: 'pending', started_at: now, completed_at: null };
}

/** Get an open salary cycle by period label. */
export function getSalaryCycle(periodLabel: string): SalaryCycle | null {
  const db = getDb();
  return db.prepare(`SELECT * FROM salary_cycles WHERE period_label = ?`).get(periodLabel) as SalaryCycle | null;
}

// ── Salary resolution ──────────────────────────────────────────────────────────

/**
 * Resolve and queue salary payouts for all active creators.
 * Caller supplies a list of {creator_id, wallet} pairs collected from the users table.
 */
export function queueSalaryPayouts(
  cycleId:   string,
  creators:  Array<{ creator_id: string; wallet: string }>,
): SalaryPayout[] {
  const db       = getDb();
  const now      = new Date().toISOString();
  const payouts: SalaryPayout[] = [];

  const insert = db.prepare(`
    INSERT INTO salary_payouts
      (payout_id, cycle_id, creator_id, wallet, tier, amount_gst, tx_hash, status, scheduled_at, confirmed_at)
    VALUES (?, ?, ?, ?, ?, ?, NULL, 'queued', ?, NULL)
  `);

  const insertMany = db.transaction((rows: Array<{ creator_id: string; wallet: string }>) => {
    for (const c of rows) {
      const snap   = aggregateMetrics(c.creator_id, 'monthly');
      const tier   = resolveCreatorTier(snap.performance_score);
      const salary = TIER_CONFIG[tier].monthly_salary;
      const id     = uuid();

      insert.run(id, cycleId, c.creator_id, c.wallet, tier, salary, now);
      payouts.push({
        payout_id:    id,
        cycle_id:     cycleId,
        creator_id:   c.creator_id,
        wallet:       c.wallet,
        tier,
        amount_gst:   salary,
        tx_hash:      null,
        status:       'queued',
        scheduled_at: now,
        confirmed_at: null,
      });
    }
  });

  insertMany(creators);
  return payouts;
}

/** Mark a payout as confirmed after on-chain tx is observed. */
export function confirmPayout(payoutId: string, txHash: string): void {
  const db  = getDb();
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE salary_payouts
    SET status = 'confirmed', tx_hash = ?, confirmed_at = ?
    WHERE payout_id = ?
  `).run(txHash, now, payoutId);
}

/** Mark a payout as failed. */
export function failPayout(payoutId: string): void {
  db().prepare(`UPDATE salary_payouts SET status = 'failed' WHERE payout_id = ?`).run(payoutId);
  function db() { return getDb(); }
}

/** Close a cycle after all payouts are settled. */
export function closeSalaryCycle(cycleId: string): void {
  const db  = getDb();
  const now = new Date().toISOString();
  const agg = db.prepare(`
    SELECT COUNT(*) AS cnt, SUM(amount_gst) AS total
    FROM salary_payouts WHERE cycle_id = ? AND status = 'confirmed'
  `).get(cycleId) as { cnt: number; total: number };

  db.prepare(`
    UPDATE salary_cycles
    SET status = 'complete', creators_paid = ?, total_gst = ?, completed_at = ?
    WHERE cycle_id = ?
  `).run(agg.cnt, agg.total ?? 0, now, cycleId);
}

// ── Queries ────────────────────────────────────────────────────────────────────

/** All queued payouts for a cycle. */
export function listCyclePayouts(cycleId: string): SalaryPayout[] {
  const db = getDb();
  return db.prepare(`SELECT * FROM salary_payouts WHERE cycle_id = ? ORDER BY scheduled_at`).all(cycleId) as SalaryPayout[];
}

/** Salary history for a creator. */
export function creatorPayoutHistory(creatorId: string, limit = 24): SalaryPayout[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM salary_payouts WHERE creator_id = ? ORDER BY scheduled_at DESC LIMIT ?
  `).all(creatorId, limit) as SalaryPayout[];
}

/** Current tier and next salary amount for a creator (based on latest monthly metrics). */
export function creatorSalaryStatus(creatorId: string): { tier: CreatorTier; monthly_salary: number; score: number } {
  const snap  = aggregateMetrics(creatorId, 'monthly');
  const tier  = resolveCreatorTier(snap.performance_score);
  return { tier, monthly_salary: TIER_CONFIG[tier].monthly_salary, score: snap.performance_score };
}
