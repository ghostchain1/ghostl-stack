/**
 * Launchpad Registry — tracks all creator token launches in SQLite.
 * Source of truth for the off-chain index of on-chain CreatorToken deployments.
 */

import { getDb } from '../backend/src/db/index.js';

export interface CreatorTokenRecord {
  id: string;
  creator_id: string;
  creator_wallet: string;
  name: string;
  symbol: string;
  token_address: string | null;
  max_supply: number;
  factory_tx_hash: string | null;
  is_active: number;
  launched_at: string;
}

/** Register a token launch initiated off-chain (before on-chain confirmation). */
export function registerPendingLaunch(params: {
  id: string;
  creatorId: string;
  creatorWallet: string;
  name: string;
  symbol: string;
  maxSupply: number;
}): CreatorTokenRecord {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO creator_tokens (id, creator_id, creator_wallet, name, symbol, token_address, max_supply, factory_tx_hash, is_active, launched_at)
     VALUES (?, ?, ?, ?, ?, NULL, ?, NULL, 1, ?)`,
  ).run(params.id, params.creatorId, params.creatorWallet, params.name, params.symbol, params.maxSupply, now);
  return getTokenById(params.id)!;
}

/** Update the on-chain token address and factory tx hash once confirmed. */
export function confirmLaunch(id: string, tokenAddress: string, factoryTxHash: string): void {
  const db = getDb();
  db.prepare(
    `UPDATE creator_tokens SET token_address=?, factory_tx_hash=? WHERE id=?`,
  ).run(tokenAddress, factoryTxHash, id);
}

/** Fetch a single record by its off-chain ID. */
export function getTokenById(id: string): CreatorTokenRecord | null {
  const db = getDb();
  return (db.prepare('SELECT * FROM creator_tokens WHERE id=?').get(id) as CreatorTokenRecord) ?? null;
}

/** Fetch the creator token record for a given creator user ID. */
export function getTokenByCreator(creatorId: string): CreatorTokenRecord | null {
  const db = getDb();
  return (
    (db.prepare('SELECT * FROM creator_tokens WHERE creator_id=? AND is_active=1').get(creatorId) as CreatorTokenRecord) ??
    null
  );
}

/** Paginated list of all active token launches, newest first. */
export function listTokens(page = 0, pageSize = 20): { tokens: CreatorTokenRecord[]; total: number } {
  const db = getDb();
  const total = (db.prepare('SELECT COUNT(*) as c FROM creator_tokens WHERE is_active=1').get() as { c: number }).c;
  const tokens = db
    .prepare('SELECT * FROM creator_tokens WHERE is_active=1 ORDER BY launched_at DESC LIMIT ? OFFSET ?')
    .all(pageSize, page * pageSize) as CreatorTokenRecord[];
  return { tokens, total };
}

/** Deactivate a token launch (governance/admin action). */
export function deactivateToken(id: string): void {
  const db = getDb();
  db.prepare('UPDATE creator_tokens SET is_active=0 WHERE id=?').run(id);
}

/** Search tokens by name or symbol (case-insensitive). */
export function searchTokens(query: string): CreatorTokenRecord[] {
  const db = getDb();
  const q = `%${query.toLowerCase()}%`;
  return db
    .prepare('SELECT * FROM creator_tokens WHERE is_active=1 AND (LOWER(name) LIKE ? OR LOWER(symbol) LIKE ?) ORDER BY launched_at DESC LIMIT 50')
    .all(q, q) as CreatorTokenRecord[];
}
