/**
 * Competition Engine — manages weekly and monthly tournaments with GST prize pools.
 *
 * Competition types: gift_battle | pk_tournament | engagement_contest | game_tournament
 *
 * Prize pools are reserved on contract creation and distributed to top-ranked
 * participants at competition close.  All settlement records are persisted to
 * `competitions` and `competition_entries` SQLite tables.
 */

import { getDb } from '../backend/src/db/index.js';
import { v4 as uuid } from 'uuid';

// ── Types ─────────────────────────────────────────────────────────────────────

export type CompetitionType =
  | 'gift_battle'
  | 'pk_tournament'
  | 'engagement_contest'
  | 'game_tournament';

export type CompetitionStatus = 'open' | 'in_progress' | 'scoring' | 'complete' | 'cancelled';

export interface Competition {
  competition_id:  string;
  title:           string;
  type:            CompetitionType;
  cadence:         'weekly' | 'monthly';
  prize_pool_gst:  number;
  max_participants: number;  // 0 = unlimited
  entry_fee_gst:   number;   // 0 = free entry
  starts_at:       string;
  ends_at:         string;
  status:          CompetitionStatus;
  created_at:      string;
}

export interface CompetitionEntry {
  entry_id:          string;
  competition_id:    string;
  creator_id:        string;
  score:             number;
  final_rank:        number | null;  // null until scoring complete
  prize_gst:         number;
  prize_tx_hash:     string | null;
  prize_status:      'pending' | 'confirmed' | 'failed';
  entered_at:        string;
}

// Standard prize breakdown: 1st 50% / 2nd 25% / 3rd 12.5% / rest split
const PRIZE_SPLITS = [0.50, 0.25, 0.125];

// ── Competition lifecycle ─────────────────────────────────────────────────────

export function createCompetition(
  title:            string,
  type:             CompetitionType,
  cadence:          Competition['cadence'],
  prizePoolGst:     number,
  startsAt:         string,
  endsAt:           string,
  maxParticipants = 0,
  entryFeeGst     = 0,
): Competition {
  const db  = getDb();
  const id  = uuid();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO competitions
      (competition_id, title, type, cadence, prize_pool_gst, max_participants,
       entry_fee_gst, starts_at, ends_at, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)
  `).run(id, title, type, cadence, prizePoolGst, maxParticipants, entryFeeGst, startsAt, endsAt, now);

  return { competition_id: id, title, type, cadence, prize_pool_gst: prizePoolGst,
           max_participants: maxParticipants, entry_fee_gst: entryFeeGst,
           starts_at: startsAt, ends_at: endsAt, status: 'open', created_at: now };
}

export function getCompetition(competitionId: string): Competition | null {
  return getDb().prepare(`SELECT * FROM competitions WHERE competition_id = ?`).get(competitionId) as Competition | null;
}

export function setCompetitionStatus(competitionId: string, status: CompetitionStatus): void {
  getDb().prepare(`UPDATE competitions SET status = ? WHERE competition_id = ?`).run(status, competitionId);
}

// ── Entry management ──────────────────────────────────────────────────────────

export function enterCompetition(competitionId: string, creatorId: string): CompetitionEntry {
  const db  = getDb();
  const now = new Date().toISOString();

  const comp = getCompetition(competitionId);
  if (!comp) throw new Error(`Competition ${competitionId} not found`);
  if (comp.status !== 'open' && comp.status !== 'in_progress') {
    throw new Error(`Competition is not accepting entries (status: ${comp.status})`);
  }

  const existing = db.prepare(`
    SELECT * FROM competition_entries WHERE competition_id = ? AND creator_id = ?
  `).get(competitionId, creatorId) as CompetitionEntry | undefined;
  if (existing) return existing;

  if (comp.max_participants > 0) {
    const cnt = (db.prepare(`
      SELECT COUNT(*) AS cnt FROM competition_entries WHERE competition_id = ?
    `).get(competitionId) as { cnt: number }).cnt;
    if (cnt >= comp.max_participants) throw new Error('Competition is full');
  }

  const id = uuid();
  db.prepare(`
    INSERT INTO competition_entries
      (entry_id, competition_id, creator_id, score, final_rank, prize_gst, prize_tx_hash, prize_status, entered_at)
    VALUES (?, ?, ?, 0, NULL, 0, NULL, 'pending', ?)
  `).run(id, competitionId, creatorId, now);

  return { entry_id: id, competition_id: competitionId, creator_id: creatorId,
           score: 0, final_rank: null, prize_gst: 0, prize_tx_hash: null,
           prize_status: 'pending', entered_at: now };
}

/** Accumulate score points for a participant (additive, thread-safe via SQLite). */
export function addScore(competitionId: string, creatorId: string, points: number): void {
  getDb().prepare(`
    UPDATE competition_entries SET score = score + ?
    WHERE competition_id = ? AND creator_id = ?
  `).run(points, competitionId, creatorId);
}

// ── Scoring & prizes ──────────────────────────────────────────────────────────

/**
 * Close scoring, assign ranks, and compute prize allocations.
 * Does NOT dispatch on-chain transactions — call confirmPrize() after tx confirms.
 */
export function scoreCompetition(competitionId: string): CompetitionEntry[] {
  const db   = getDb();
  const comp = getCompetition(competitionId);
  if (!comp) throw new Error(`Competition ${competitionId} not found`);

  setCompetitionStatus(competitionId, 'scoring');

  const entries = db.prepare(`
    SELECT * FROM competition_entries WHERE competition_id = ? ORDER BY score DESC
  `).all(competitionId) as CompetitionEntry[];

  const pool       = comp.prize_pool_gst;
  const topSplit   = PRIZE_SPLITS;
  const remainder  = entries.length > topSplit.length
    ? pool * (1 - topSplit.reduce((a, b) => a + b, 0)) / (entries.length - topSplit.length)
    : 0;

  const update = db.prepare(`
    UPDATE competition_entries SET final_rank = ?, prize_gst = ? WHERE entry_id = ?
  `);

  const batch = db.transaction(() => {
    entries.forEach((e, i) => {
      const rank  = i + 1;
      const prize = i < topSplit.length ? pool * topSplit[i] : remainder;
      update.run(rank, Math.round(prize * 100) / 100, e.entry_id);
    });
  });
  batch();

  setCompetitionStatus(competitionId, 'complete');
  return listEntries(competitionId);
}

export function confirmPrize(entryId: string, txHash: string): void {
  getDb().prepare(`
    UPDATE competition_entries SET prize_tx_hash = ?, prize_status = 'confirmed'
    WHERE entry_id = ?
  `).run(txHash, entryId);
}

// ── Queries ────────────────────────────────────────────────────────────────────

export function listCompetitions(
  status?: CompetitionStatus,
  cadence?: Competition['cadence'],
  limit = 50,
): Competition[] {
  const db = getDb();
  let sql  = `SELECT * FROM competitions WHERE 1=1`;
  const params: (string | number)[] = [];
  if (status)  { sql += ` AND status = ?`;  params.push(status); }
  if (cadence) { sql += ` AND cadence = ?`; params.push(cadence); }
  sql += ` ORDER BY starts_at DESC LIMIT ?`;
  params.push(limit);
  return db.prepare(sql).all(...params) as Competition[];
}

export function listEntries(competitionId: string): CompetitionEntry[] {
  return getDb().prepare(`
    SELECT * FROM competition_entries WHERE competition_id = ? ORDER BY COALESCE(final_rank, 99999) ASC, score DESC
  `).all(competitionId) as CompetitionEntry[];
}

export function creatorCompetitionHistory(creatorId: string, limit = 20): CompetitionEntry[] {
  return getDb().prepare(`
    SELECT ce.*, c.title, c.type, c.cadence
    FROM competition_entries ce
    JOIN competitions c ON c.competition_id = ce.competition_id
    WHERE ce.creator_id = ? ORDER BY ce.entered_at DESC LIMIT ?
  `).all(creatorId, limit) as CompetitionEntry[];
}

export function getEntryByCreator(competitionId: string, creatorId: string): CompetitionEntry | null {
  return getDb().prepare(`
    SELECT * FROM competition_entries WHERE competition_id = ? AND creator_id = ?
  `).get(competitionId, creatorId) as CompetitionEntry | null;
}
