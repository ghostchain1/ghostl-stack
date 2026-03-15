/**
 * GhostChain Universal Identity — Identity Verifier
 *
 * Manages creator verification requests and GhostBrain-driven review workflow.
 *
 * Eligibility requirements:
 *   • ≥ 100 followers
 *   • ≥ 10 completed streams
 *   • No pending or active verification request for the same user
 *
 * The review step is invoked by the admin API or GhostBrain governor and
 * can approve / reject with a free-text note.
 *
 * Approved creators receive the `verified_creator` badge type, which is
 * then reflected in GhostProfile.verifiedBadge.
 */

import type Database from 'better-sqlite3';

export type VerificationStatus = 'pending' | 'approved' | 'rejected';

export interface VerificationRequest {
  userId: string;
  status: VerificationStatus;
  requestedAt: string;
  reviewedAt: string | null;
  reviewNote: string | null;
  badgeType: string | null;
  isVerified: boolean;
}

export interface EligibilityCheck {
  eligible: boolean;
  reasons: string[];
}

const MIN_FOLLOWERS = 100;
const MIN_STREAMS   = 10;

// ─── Eligibility ──────────────────────────────────────────────────────────────

export function checkEligibility(
  db: Database.Database,
  userId: string,
): EligibilityCheck {
  const user = db
    .prepare('SELECT followers FROM users WHERE id = ?')
    .get(userId) as { followers: number } | undefined;

  const { cnt: streamCount } = db
    .prepare('SELECT COUNT(*) AS cnt FROM streams WHERE host_id = ? AND is_live = 0')
    .get(userId) as { cnt: number };

  const reasons: string[] = [];

  if ((user?.followers ?? 0) < MIN_FOLLOWERS) {
    reasons.push(
      `Need at least ${MIN_FOLLOWERS} followers (currently ${user?.followers ?? 0}).`,
    );
  }

  if (streamCount < MIN_STREAMS) {
    reasons.push(
      `Need at least ${MIN_STREAMS} completed streams (currently ${streamCount}).`,
    );
  }

  return { eligible: reasons.length === 0, reasons };
}

// ─── Request ──────────────────────────────────────────────────────────────────

/**
 * Submit a creator verification request.
 *
 * @throws if the user does not meet eligibility requirements, or if a pending
 *         request already exists.
 */
export function submitVerificationRequest(
  db: Database.Database,
  userId: string,
): void {
  const existing = db
    .prepare(
      `SELECT status FROM creator_verifications
       WHERE  user_id = ? AND status = 'pending'`,
    )
    .get(userId);

  if (existing) {
    throw new Error('A verification request is already pending for this account.');
  }

  const { eligible, reasons } = checkEligibility(db, userId);
  if (!eligible) {
    throw new Error(`Eligibility requirements not met: ${reasons.join(' ')}`);
  }

  db.prepare(
    `INSERT INTO creator_verifications
       (user_id, status, requested_at)
     VALUES (?, 'pending', ?)
     ON CONFLICT(user_id) DO UPDATE SET
       status       = 'pending',
       requested_at = excluded.requested_at,
       reviewed_at  = NULL,
       review_note  = NULL,
       is_verified  = 0,
       badge_type   = NULL`,
  ).run(userId, new Date().toISOString());
}

// ─── Review ───────────────────────────────────────────────────────────────────

/**
 * Approve or reject a pending verification request.
 * Intended to be called by the admin API or GhostBrain governor.
 */
export function reviewVerification(
  db: Database.Database,
  userId: string,
  approved: boolean,
  reviewNote: string,
): void {
  db.prepare(
    `UPDATE creator_verifications
     SET    status      = ?,
            reviewed_at = ?,
            review_note = ?,
            is_verified = ?,
            badge_type  = ?
     WHERE  user_id = ?`,
  ).run(
    approved ? 'approved' : 'rejected',
    new Date().toISOString(),
    reviewNote.slice(0, 500),
    approved ? 1 : 0,
    approved ? 'verified_creator' : null,
    userId,
  );
}

// ─── Query ────────────────────────────────────────────────────────────────────

export function getVerificationStatus(
  db: Database.Database,
  userId: string,
): VerificationRequest | null {
  const row = db
    .prepare(
      `SELECT user_id      AS userId,
              status,
              requested_at AS requestedAt,
              reviewed_at  AS reviewedAt,
              review_note  AS reviewNote,
              badge_type   AS badgeType,
              is_verified  AS isVerifiedInt
       FROM   creator_verifications
       WHERE  user_id = ?`,
    )
    .get(userId) as
    | (Omit<VerificationRequest, 'isVerified'> & { isVerifiedInt: number })
    | undefined;

  if (!row) return null;

  const { isVerifiedInt, ...rest } = row;
  return { ...rest, isVerified: Boolean(isVerifiedInt) };
}

/** Return all pending verification requests (for admin/GhostBrain review). */
export function listPendingRequests(
  db: Database.Database,
): Array<{ userId: string; requestedAt: string }> {
  return db
    .prepare(
      `SELECT user_id      AS userId,
              requested_at AS requestedAt
       FROM   creator_verifications
       WHERE  status = 'pending'
       ORDER  BY requested_at ASC`,
    )
    .all() as Array<{ userId: string; requestedAt: string }>;
}
