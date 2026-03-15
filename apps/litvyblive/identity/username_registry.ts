/**
 * GhostChain Universal Identity — Username Registry
 *
 * Manages the mapping between ghost handles (@username.ghost), wallet addresses,
 * and user IDs. Backed by the LitVybzLive SQLite DB; on-chain anchoring is
 * handled separately via GhostIdentity.sol on GhostChain L1.
 *
 * All transactions in LitVybzLive occur on GhostL3 (chain_id 903).
 * Username anchoring to L1 (chain_id 14000101) is permanent record-keeping only.
 */

import type Database from 'better-sqlite3';

/** Compiled ghost handle: `@username.ghost` */
export const GHOST_SUFFIX = '.ghost';

/** Valid username: 3–32 chars, alphanumeric + underscore only. */
const USERNAME_RE = /^[a-zA-Z0-9_]{3,32}$/;

export interface GhostUsername {
  userId: string;
  username: string;
  /** Canonical handle e.g. `@djNova.ghost` */
  ghostHandle: string;
  walletAddress: string | null;
  createdAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function toGhostHandle(username: string): string {
  return `@${username.toLowerCase()}${GHOST_SUFFIX}`;
}

/**
 * Strip leading `@` and trailing `.ghost` suffix, then lowercase.
 * Used for normalised storage comparisons.
 */
export function normaliseHandle(raw: string): string {
  return raw.toLowerCase().replace(/^@/, '').replace(/\.ghost$/i, '');
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function usernameExists(db: Database.Database, username: string): boolean {
  const row = db
    .prepare('SELECT 1 FROM users WHERE LOWER(username) = LOWER(?)')
    .get(username);
  return row != null;
}

export function resolveUsername(
  db: Database.Database,
  username: string,
): GhostUsername | null {
  const row = db
    .prepare(
      `SELECT id           AS userId,
              username,
              wallet_address AS walletAddress,
              created_at     AS createdAt
       FROM   users
       WHERE  LOWER(username) = LOWER(?)`,
    )
    .get(username) as Omit<GhostUsername, 'ghostHandle'> | undefined;
  if (!row) return null;
  return { ...row, ghostHandle: toGhostHandle(row.username) };
}

export function resolveWallet(
  db: Database.Database,
  walletAddress: string,
): GhostUsername | null {
  const row = db
    .prepare(
      `SELECT id           AS userId,
              username,
              wallet_address AS walletAddress,
              created_at     AS createdAt
       FROM   users
       WHERE  LOWER(wallet_address) = LOWER(?)`,
    )
    .get(walletAddress) as Omit<GhostUsername, 'ghostHandle'> | undefined;
  if (!row) return null;
  return { ...row, ghostHandle: toGhostHandle(row.username) };
}

// ─── Mutations ────────────────────────────────────────────────────────────────

/**
 * Claim / update a username for an existing user.
 *
 * @throws {Error} if the username format is invalid or already taken.
 */
export function registerUsername(
  db: Database.Database,
  userId: string,
  username: string,
  walletAddress: string | null,
): void {
  if (!USERNAME_RE.test(username)) {
    throw new Error(
      'Username must be 3–32 characters, alphanumeric and underscores only.',
    );
  }
  // Check collision excluding the requesting user (idempotent re-registration).
  const collision = db
    .prepare(
      'SELECT id FROM users WHERE LOWER(username) = LOWER(?) AND id != ?',
    )
    .get(username, userId);
  if (collision) {
    throw new Error('Username already taken.');
  }
  db.prepare(
    'UPDATE users SET username = ?, wallet_address = ? WHERE id = ?',
  ).run(username, walletAddress, userId);
}

/**
 * Link (or update) a wallet address to an already-registered user ID.
 * Does not change the username — wallet linking is independent.
 */
export function linkWallet(
  db: Database.Database,
  userId: string,
  walletAddress: string,
): void {
  // Ensure no other user owns this wallet.
  const collision = db
    .prepare('SELECT id FROM users WHERE LOWER(wallet_address) = LOWER(?) AND id != ?')
    .get(walletAddress, userId);
  if (collision) {
    throw new Error('Wallet address already linked to another identity.');
  }
  db.prepare('UPDATE users SET wallet_address = ? WHERE id = ?').run(
    walletAddress,
    userId,
  );
}
