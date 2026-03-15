/**
 * GhostChain Universal Identity — Profile Manager
 *
 * Stores and retrieves extended creator profiles.  Profile data lives in the
 * `identity_profiles` SQLite table (created by the DB migration in db/index.ts).
 * The on-chain anchor tx-hash (GhostChain L1) is persisted here once set.
 */

import type Database from 'better-sqlite3';
import { toGhostHandle } from './username_registry.js';

export interface GhostProfile {
  userId: string;
  username: string;
  /** Canonical handle e.g. `@djNova.ghost` */
  ghostHandle: string;
  avatarUrl: string;
  bio: string;
  socialLinks: Record<string, string>;
  creatorLevel: number;
  followers: number;
  following: number;
  isVerified: boolean;
  verifiedBadge: string | null;
  /** GhostChain L1 tx-hash from GhostIdentity.sol registration */
  l1AnchorTxHash: string | null;
  updatedAt: string;
}

export interface UpdateProfilePayload {
  avatarUrl?: string;
  /** Max 500 characters */
  bio?: string;
  /** Key-value pairs: platform → URL. Max 5 entries. */
  socialLinks?: Record<string, string>;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function getProfile(
  db: Database.Database,
  userId: string,
): GhostProfile | null {
  const row = db
    .prepare(
      `SELECT u.id                               AS userId,
              u.username,
              COALESCE(u.avatar_url, '')          AS avatarUrl,
              u.followers,
              u.following,
              COALESCE(ip.bio, '')               AS bio,
              COALESCE(ip.social_links, '{}')    AS socialLinksJson,
              COALESCE(ip.creator_level, 1)      AS creatorLevel,
              COALESCE(cv.is_verified, 0)        AS isVerifiedInt,
              cv.badge_type                      AS verifiedBadge,
              ip.l1_anchor_tx_hash               AS l1AnchorTxHash,
              COALESCE(ip.updated_at, u.created_at) AS updatedAt
       FROM   users u
       LEFT JOIN identity_profiles ip      ON ip.user_id = u.id
       LEFT JOIN creator_verifications cv  ON cv.user_id = u.id
                                          AND cv.is_verified = 1
       WHERE  u.id = ?`,
    )
    .get(userId) as
    | (Omit<GhostProfile, 'ghostHandle' | 'socialLinks' | 'isVerified'> & {
        socialLinksJson: string;
        isVerifiedInt: number;
      })
    | undefined;

  if (!row) return null;

  const { socialLinksJson, isVerifiedInt, ...rest } = row;

  let parsedLinks: Record<string, string> = {};
  try {
    parsedLinks = JSON.parse(socialLinksJson) as Record<string, string>;
  } catch {
    parsedLinks = {};
  }

  return {
    ...rest,
    ghostHandle: toGhostHandle(rest.username),
    socialLinks: parsedLinks,
    isVerified: Boolean(isVerifiedInt),
  };
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function upsertProfile(
  db: Database.Database,
  userId: string,
  payload: UpdateProfilePayload,
): void {
  const bio = (payload.bio ?? '').slice(0, 500);

  // Enforce max 5 social links; strip any non-string values.
  const rawLinks = payload.socialLinks ?? {};
  const socialLinks: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawLinks).slice(0, 5)) {
    if (typeof k === 'string' && typeof v === 'string') {
      socialLinks[k] = v;
    }
  }

  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO identity_profiles
       (user_id, bio, social_links, creator_level, updated_at)
     VALUES (?, ?, ?, 1, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       bio          = excluded.bio,
       social_links = excluded.social_links,
       updated_at   = excluded.updated_at`,
  ).run(userId, bio, JSON.stringify(socialLinks), now);

  if (payload.avatarUrl) {
    db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(
      payload.avatarUrl,
      userId,
    );
  }
}

/**
 * Record the GhostChain L1 anchor transaction hash after a successful
 * `GhostIdentity.register()` call.  This provides permanent provenance.
 */
export function setL1Anchor(
  db: Database.Database,
  userId: string,
  txHash: string,
): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO identity_profiles
       (user_id, bio, social_links, creator_level, l1_anchor_tx_hash, updated_at)
     VALUES (?, '', '{}', 1, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       l1_anchor_tx_hash = excluded.l1_anchor_tx_hash,
       updated_at        = excluded.updated_at`,
  ).run(userId, txHash, now);
}
