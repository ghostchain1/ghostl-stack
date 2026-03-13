/**
 * GhostStack AI Vault — Encrypted Storage
 * AES-256-GCM encrypted SQLite-backed key-value store.
 * All values are encrypted at rest. Keys are stored as SHA-256 hashed paths.
 *
 * Secret path format: vault://<namespace>/<path>
 * Examples:
 *   vault://docker/postgres/password
 *   vault://validator/l1/mainnet/key
 *   vault://bridge/l2/signer
 *
 * GhostChain L1 (14000101) | L2 (901) | L3 (903) | GST gas token
 */

import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  type EncryptedBlob,
  type EncryptionAlgorithm,
  SecureKey,
  encrypt,
  decrypt,
  sha256,
  randomHex,
} from '../core/crypto-engine.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface SecretRecord {
  id: string;
  path: string;           // canonical vault:// path
  namespace: string;
  version: number;
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;
  rotatedAt?: number;
  metadata: Record<string, string>;
  encryptedBlob: EncryptedBlob;
}

export interface SecretMeta {
  id: string;
  path: string;
  namespace: string;
  version: number;
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;
  rotatedAt?: number;
  metadata: Record<string, string>;
}

// ── EncryptedStore ─────────────────────────────────────────────────────────

export class EncryptedStore {
  private readonly _db: Database.Database;
  private readonly _masterKey: SecureKey;
  private readonly _algorithm: EncryptionAlgorithm;

  constructor(dbPath: string, masterKey: SecureKey, algorithm: EncryptionAlgorithm = 'aes-256-gcm') {
    const absPath = resolve(dbPath);
    mkdirSync(dirname(absPath), { recursive: true });

    this._db = new Database(absPath, { verbose: undefined });
    this._masterKey = masterKey;
    this._algorithm = algorithm;

    this._configure();
    this._migrate();
  }

  private _configure(): void {
    // Enable WAL for better concurrent read performance
    this._db.pragma('journal_mode = WAL');
    this._db.pragma('synchronous = FULL');   // data safety
    this._db.pragma('foreign_keys = ON');
    this._db.pragma('temp_store = MEMORY');
    this._db.pragma('cache_size = -8192');   // 8 MB cache
    // Encrypt the WAL as well (in-process only; not SQLCipher)
  }

  private _migrate(): void {
    this._db.exec(`
      CREATE TABLE IF NOT EXISTS secrets (
        id          TEXT PRIMARY KEY,
        path_hash   TEXT UNIQUE NOT NULL,
        path        TEXT NOT NULL,
        namespace   TEXT NOT NULL DEFAULT '',
        version     INTEGER NOT NULL DEFAULT 1,
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL,
        expires_at  INTEGER,
        rotated_at  INTEGER,
        metadata    TEXT NOT NULL DEFAULT '{}',
        blob        TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_secrets_namespace ON secrets(namespace);
      CREATE INDEX IF NOT EXISTS idx_secrets_expires   ON secrets(expires_at) WHERE expires_at IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_secrets_updated   ON secrets(updated_at);
    `);
  }

  // ── Write ────────────────────────────────────────────────────────────────

  /**
   * Store a secret value at the given vault:// path.
   * Overwrites existing record (creates a new version).
   */
  set(
    path: string,
    value: string | Buffer,
    opts: {
      namespace?: string;
      expiresAt?: number;
      metadata?: Record<string, string>;
    } = {},
  ): SecretMeta {
    const pathHash = sha256(path);
    const id       = randomHex(16);
    const now      = Date.now();
    const namespace = opts.namespace ?? this._namespaceFromPath(path);

    // Encrypt the value — use path as AAD for binding ciphertext to path
    const aad  = Buffer.from(path, 'utf8');
    const blob = encrypt(this._masterKey, value, this._algorithm, aad);

    const existing = this._db.prepare<[string]>('SELECT id, version FROM secrets WHERE path_hash = ?').get(pathHash) as { id: string; version: number } | undefined;

    if (existing) {
      // Update existing record (increment version)
      this._db.prepare(`
        UPDATE secrets
        SET id = ?, version = ?, updated_at = ?, expires_at = ?, metadata = ?, blob = ?
        WHERE path_hash = ?
      `).run(
        id,
        existing.version + 1,
        now,
        opts.expiresAt ?? null,
        JSON.stringify(opts.metadata ?? {}),
        JSON.stringify(blob),
        pathHash,
      );

      return {
        id,
        path,
        namespace,
        version: existing.version + 1,
        createdAt: now,
        updatedAt: now,
        expiresAt: opts.expiresAt,
        metadata: opts.metadata ?? {},
      };
    }

    // Insert new record
    this._db.prepare(`
      INSERT INTO secrets (id, path_hash, path, namespace, version, created_at, updated_at, expires_at, metadata, blob)
      VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
    `).run(
      id,
      pathHash,
      path,
      namespace,
      now,
      now,
      opts.expiresAt ?? null,
      JSON.stringify(opts.metadata ?? {}),
      JSON.stringify(blob),
    );

    return { id, path, namespace, version: 1, createdAt: now, updatedAt: now, expiresAt: opts.expiresAt, metadata: opts.metadata ?? {} };
  }

  // ── Read ─────────────────────────────────────────────────────────────────

  /**
   * Retrieve and decrypt a secret value.
   * Returns null if not found or expired.
   */
  get(path: string): Buffer | null {
    const row = this._getRow(path);
    if (!row) return null;

    if (row.expires_at && row.expires_at < Date.now()) {
      // Secret expired — delete and return null
      this.delete(path);
      return null;
    }

    const blob = JSON.parse(row.blob as string) as EncryptedBlob;
    const aad  = Buffer.from(path, 'utf8');

    try {
      return decrypt(this._masterKey, blob, aad);
    } catch (err) {
      throw new Error(`[encrypted-store] decryption failed for path "${path}": ${(err as Error).message}`);
    }
  }

  /**
   * Retrieve secret as UTF-8 string. Returns null if not found/expired.
   */
  getString(path: string): string | null {
    const buf = this.get(path);
    return buf ? buf.toString('utf8') : null;
  }

  /**
   * Get metadata (without decrypting the value).
   */
  getMeta(path: string): SecretMeta | null {
    const row = this._getRow(path);
    if (!row) return null;
    return this._rowToMeta(row);
  }

  /**
   * Check whether a secret exists (and is not expired).
   */
  has(path: string): boolean {
    const row = this._getRow(path);
    if (!row) return false;
    if (row.expires_at && (row.expires_at as number) < Date.now()) return false;
    return true;
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  delete(path: string): boolean {
    const pathHash = sha256(path);
    const result = this._db.prepare('DELETE FROM secrets WHERE path_hash = ?').run(pathHash);
    return result.changes > 0;
  }

  // ── List ──────────────────────────────────────────────────────────────────

  /**
   * List secret metadata within a namespace prefix.
   * Does NOT return decrypted values.
   */
  list(namespaceOrPrefix = ''): SecretMeta[] {
    const rows = this._db.prepare<[string]>(`
      SELECT id, path, namespace, version, created_at, updated_at, expires_at, rotated_at, metadata
      FROM secrets
      WHERE path LIKE ? AND (expires_at IS NULL OR expires_at > ?)
      ORDER BY updated_at DESC
    `).all(`${namespaceOrPrefix}%`, Date.now()) as Array<Record<string, unknown>>;

    return rows.map(r => this._rowToMeta(r));
  }

  /**
   * Mark a secret as rotated (updates rotated_at timestamp).
   */
  markRotated(path: string): void {
    const pathHash = sha256(path);
    this._db.prepare('UPDATE secrets SET rotated_at = ? WHERE path_hash = ?').run(Date.now(), pathHash);
  }

  // ── Expire / Prune ────────────────────────────────────────────────────────

  /** Delete all expired secrets. Returns count of deleted records. */
  pruneExpired(): number {
    const result = this._db.prepare('DELETE FROM secrets WHERE expires_at IS NOT NULL AND expires_at < ?').run(Date.now());
    return result.changes;
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _getRow(path: string): Record<string, unknown> | undefined {
    const pathHash = sha256(path);
    return this._db.prepare<[string]>('SELECT * FROM secrets WHERE path_hash = ?').get(pathHash) as Record<string, unknown> | undefined;
  }

  private _rowToMeta(row: Record<string, unknown>): SecretMeta {
    return {
      id:        String(row['id'] ?? ''),
      path:      String(row['path'] ?? ''),
      namespace: String(row['namespace'] ?? ''),
      version:   Number(row['version'] ?? 1),
      createdAt: Number(row['created_at'] ?? 0),
      updatedAt: Number(row['updated_at'] ?? 0),
      expiresAt: row['expires_at'] != null ? Number(row['expires_at']) : undefined,
      rotatedAt: row['rotated_at'] != null ? Number(row['rotated_at']) : undefined,
      metadata:  JSON.parse(String(row['metadata'] ?? '{}')),
    };
  }

  private _namespaceFromPath(path: string): string {
    // vault://namespace/... → namespace
    const match = path.match(/^vault:\/\/([^/]+)/);
    return match?.[1] ?? '';
  }

  /** Close the database cleanly. */
  close(): void {
    this._db.close();
  }

  /** Return row count (for monitoring). */
  count(): number {
    const row = this._db.prepare('SELECT COUNT(*) as cnt FROM secrets').get() as { cnt: number };
    return row.cnt;
  }
}
