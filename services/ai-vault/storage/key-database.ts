/**
 * GhostStack AI Vault — Key Database
 * Tracks key metadata, lifecycle state, chain assignments,
 * rotation history, and signing records.
 *
 * Stores only metadata — actual key material lives in EncryptedStore.
 * GhostChain L1 (14000101) | L2 (901) | L3 (903) | GST gas token
 */

import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomHex } from '../core/crypto-engine.js';

// ── Types ──────────────────────────────────────────────────────────────────

export type KeyAlgorithm = 'ed25519' | 'x25519' | 'secp256k1' | 'aes-256' | 'chacha20';
export type KeyPurpose   = 'signing' | 'encryption' | 'key-exchange' | 'validator' | 'bridge' | 'treasury' | 'sequencer';
export type KeyState     = 'active' | 'rotating' | 'retired' | 'compromised' | 'revoked';
export type KeyLayer     = 'l1' | 'l2' | 'l3' | 'all';

export interface KeyRecord {
  id: string;
  name: string;           // human label (e.g. "validator-l1-mainnet")
  purpose: KeyPurpose;
  algorithm: KeyAlgorithm;
  layer: KeyLayer;
  chainId?: number;
  state: KeyState;
  publicKey?: string;     // hex — safe to store
  secretPath: string;     // vault:// path to encrypted private key
  createdAt: number;
  updatedAt: number;
  rotatedAt?: number;
  expiresAt?: number;
  riskScore: number;
  metadata: Record<string, string>;
  rotationCount: number;
}

export interface KeyRotationEntry {
  id: string;
  keyId: string;
  oldPublicKey?: string;
  newPublicKey?: string;
  initiatedBy: string;    // actor id
  reason: string;
  timestamp: number;
}

// ── KeyDatabase ────────────────────────────────────────────────────────────

export class KeyDatabase {
  private readonly _db: Database.Database;

  constructor(dbPath: string) {
    const absPath = resolve(dbPath);
    mkdirSync(dirname(absPath), { recursive: true });
    this._db = new Database(absPath, { verbose: undefined });
    this._configure();
    this._migrate();
  }

  private _configure(): void {
    this._db.pragma('journal_mode = WAL');
    this._db.pragma('synchronous = FULL');
    this._db.pragma('foreign_keys = ON');
  }

  private _migrate(): void {
    this._db.exec(`
      CREATE TABLE IF NOT EXISTS keys (
        id              TEXT PRIMARY KEY,
        name            TEXT UNIQUE NOT NULL,
        purpose         TEXT NOT NULL,
        algorithm       TEXT NOT NULL,
        layer           TEXT NOT NULL DEFAULT 'l1',
        chain_id        INTEGER,
        state           TEXT NOT NULL DEFAULT 'active',
        public_key      TEXT,
        secret_path     TEXT NOT NULL,
        created_at      INTEGER NOT NULL,
        updated_at      INTEGER NOT NULL,
        rotated_at      INTEGER,
        expires_at      INTEGER,
        risk_score      REAL NOT NULL DEFAULT 0,
        metadata        TEXT NOT NULL DEFAULT '{}',
        rotation_count  INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS key_rotations (
        id              TEXT PRIMARY KEY,
        key_id          TEXT NOT NULL REFERENCES keys(id),
        old_public_key  TEXT,
        new_public_key  TEXT,
        initiated_by    TEXT NOT NULL,
        reason          TEXT NOT NULL DEFAULT 'scheduled',
        timestamp       INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS key_signs (
        id          TEXT PRIMARY KEY,
        key_id      TEXT NOT NULL REFERENCES keys(id),
        actor       TEXT NOT NULL,
        message_hash TEXT NOT NULL,
        timestamp   INTEGER NOT NULL,
        purpose     TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_keys_state    ON keys(state);
      CREATE INDEX IF NOT EXISTS idx_keys_purpose  ON keys(purpose);
      CREATE INDEX IF NOT EXISTS idx_keys_layer    ON keys(layer);
      CREATE INDEX IF NOT EXISTS idx_keys_expires  ON keys(expires_at) WHERE expires_at IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_rot_key       ON key_rotations(key_id);
      CREATE INDEX IF NOT EXISTS idx_sign_key      ON key_signs(key_id);
    `);
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  insert(opts: Omit<KeyRecord, 'id' | 'createdAt' | 'updatedAt' | 'rotationCount' | 'riskScore'> & Partial<Pick<KeyRecord, 'riskScore'>>): KeyRecord {
    const id  = randomHex(16);
    const now = Date.now();
    this._db.prepare(`
      INSERT INTO keys (id, name, purpose, algorithm, layer, chain_id, state, public_key, secret_path,
        created_at, updated_at, rotated_at, expires_at, risk_score, metadata, rotation_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `).run(
      id, opts.name, opts.purpose, opts.algorithm, opts.layer, opts.chainId ?? null,
      opts.state, opts.publicKey ?? null, opts.secretPath, now, now,
      opts.rotatedAt ?? null, opts.expiresAt ?? null, opts.riskScore ?? 0,
      JSON.stringify(opts.metadata ?? {}),
    );
    return this.getById(id)!;
  }

  getById(id: string): KeyRecord | null {
    const row = this._db.prepare<[string]>('SELECT * FROM keys WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this._rowToRecord(row) : null;
  }

  getByName(name: string): KeyRecord | null {
    const row = this._db.prepare<[string]>('SELECT * FROM keys WHERE name = ?').get(name) as Record<string, unknown> | undefined;
    return row ? this._rowToRecord(row) : null;
  }

  update(id: string, fields: Partial<Omit<KeyRecord, 'id' | 'createdAt'>>): void {
    const sets: string[] = ['updated_at = ?'];
    const params: (string | number | null)[] = [Date.now()];

    if (fields.state        != null) { sets.push('state = ?');         params.push(fields.state); }
    if (fields.publicKey    != null) { sets.push('public_key = ?');    params.push(fields.publicKey); }
    if (fields.secretPath   != null) { sets.push('secret_path = ?');   params.push(fields.secretPath); }
    if (fields.riskScore    != null) { sets.push('risk_score = ?');    params.push(fields.riskScore); }
    if (fields.rotatedAt    != null) { sets.push('rotated_at = ?');    params.push(fields.rotatedAt); }
    if (fields.expiresAt    != null) { sets.push('expires_at = ?');    params.push(fields.expiresAt); }
    if (fields.rotationCount != null) { sets.push('rotation_count = ?'); params.push(fields.rotationCount); }
    if (fields.metadata     != null) { sets.push('metadata = ?');      params.push(JSON.stringify(fields.metadata)); }

    params.push(id);
    this._db.prepare(`UPDATE keys SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  }

  list(filter: { purpose?: KeyPurpose; layer?: KeyLayer; state?: KeyState } = {}): KeyRecord[] {
    const conditions: string[] = [];
    const params: string[] = [];
    if (filter.purpose) { conditions.push('purpose = ?'); params.push(filter.purpose); }
    if (filter.layer)   { conditions.push('layer = ?');   params.push(filter.layer); }
    if (filter.state)   { conditions.push('state = ?');   params.push(filter.state); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = this._db.prepare(`SELECT * FROM keys ${where} ORDER BY created_at DESC`).all(...params) as Array<Record<string, unknown>>;
    return rows.map(r => this._rowToRecord(r));
  }

  // ── Rotation History ──────────────────────────────────────────────────────

  recordRotation(opts: Omit<KeyRotationEntry, 'id' | 'timestamp'>): void {
    const id  = randomHex(12);
    const now = Date.now();
    this._db.prepare(`
      INSERT INTO key_rotations (id, key_id, old_public_key, new_public_key, initiated_by, reason, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, opts.keyId, opts.oldPublicKey ?? null, opts.newPublicKey ?? null, opts.initiatedBy, opts.reason, now);

    // Increment rotation counter
    this._db.prepare('UPDATE keys SET rotation_count = rotation_count + 1 WHERE id = ?').run(opts.keyId);
  }

  getRotationHistory(keyId: string, limit = 50): KeyRotationEntry[] {
    return (this._db.prepare<[string, number]>(`
      SELECT * FROM key_rotations WHERE key_id = ? ORDER BY timestamp DESC LIMIT ?
    `).all(keyId, limit) as Array<Record<string, unknown>>).map(r => ({
      id:            String(r['id']),
      keyId:         String(r['key_id']),
      ...(r['old_public_key'] != null && { oldPublicKey: String(r['old_public_key']) }),
      ...(r['new_public_key'] != null && { newPublicKey: String(r['new_public_key']) }),
      initiatedBy:   String(r['initiated_by']),
      reason:        String(r['reason']),
      timestamp:     Number(r['timestamp']),
    }));
  }

  // ── Signing Records ────────────────────────────────────────────────────────

  recordSign(keyId: string, actor: string, messageHash: string, purpose?: string): void {
    const id  = randomHex(12);
    const now = Date.now();
    this._db.prepare(`
      INSERT INTO key_signs (id, key_id, actor, message_hash, timestamp, purpose)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, keyId, actor, messageHash, now, purpose ?? null);
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _rowToRecord(row: Record<string, unknown>): KeyRecord {
    return {
      id:            String(row['id']),
      name:          String(row['name']),
      purpose:       String(row['purpose']) as KeyPurpose,
      algorithm:     String(row['algorithm']) as KeyAlgorithm,
      layer:         String(row['layer']) as KeyLayer,
      ...(row['chain_id']   != null && { chainId:   Number(row['chain_id']) }),
      state:         String(row['state']) as KeyState,
      ...(row['public_key'] != null && { publicKey: String(row['public_key']) }),
      secretPath:    String(row['secret_path']),
      createdAt:     Number(row['created_at']),
      updatedAt:     Number(row['updated_at']),
      ...(row['rotated_at'] != null && { rotatedAt: Number(row['rotated_at']) }),
      ...(row['expires_at'] != null && { expiresAt: Number(row['expires_at']) }),
      riskScore:     Number(row['risk_score'] ?? 0),
      metadata:      JSON.parse(String(row['metadata'] ?? '{}')),
      rotationCount: Number(row['rotation_count'] ?? 0),
    };
  }

  close(): void {
    this._db.close();
  }
}
