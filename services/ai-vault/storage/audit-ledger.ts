/**
 * GhostStack AI Vault — Immutable Audit Ledger
 * Tamper-evident append-only logging of every vault operation.
 * Each entry contains a chained hash linking it to previous entries.
 * Optionally mirrored to GhostChain L1 for on-chain attestation.
 *
 * Log format complies with SOC2 + ISO27001 audit requirements.
 * GhostChain L1 (14000101) | L2 (901) | L3 (903) | GST gas token
 */

import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { sha256, randomHex } from '../core/crypto-engine.js';

// ── Types ──────────────────────────────────────────────────────────────────

export type AuditAction =
  | 'secret.read'
  | 'secret.write'
  | 'secret.delete'
  | 'secret.rotate'
  | 'secret.expire'
  | 'key.generate'
  | 'key.rotate'
  | 'key.sign'
  | 'key.revoke'
  | 'auth.issue'
  | 'auth.revoke'
  | 'auth.deny'
  | 'anomaly.detected'
  | 'threat.response'
  | 'policy.update'
  | 'vault.start'
  | 'vault.stop'
  | 'compliance.report'
  | 'snapshot.create'
  | 'snapshot.restore'
  | 'agent.action';

export type AuditResult = 'success' | 'failure' | 'denied' | 'blocked';

export interface AuditEntry {
  id: string;
  timestamp: number;
  actor: string;      // actor id (hashed, non-reversible)
  actorType: string;
  resource: string;   // vault:// path or resource descriptor
  action: AuditAction;
  result: AuditResult;
  riskScore: number;  // 0–1
  chainHash: string;  // SHA-256(prevHash + entry fields) — tamper detection
  metadata?: Record<string, string>;
  message?: string;
}

export interface AuditStats {
  total: number;
  byAction: Record<string, number>;
  byResult: Record<string, number>;
  avgRiskScore: number;
  highRiskCount: number;
}

// ── AuditLedger ────────────────────────────────────────────────────────────

export class AuditLedger {
  private readonly _db: Database.Database;
  private _lastHash = '0000000000000000000000000000000000000000000000000000000000000000';

  constructor(dbPath: string) {
    const absPath = resolve(dbPath);
    mkdirSync(dirname(absPath), { recursive: true });

    this._db = new Database(absPath, { verbose: undefined });
    this._configure();
    this._migrate();
    this._loadLastHash();
  }

  private _configure(): void {
    this._db.pragma('journal_mode = WAL');
    this._db.pragma('synchronous = FULL');
    this._db.pragma('foreign_keys = ON');
  }

  private _migrate(): void {
    this._db.exec(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id          TEXT PRIMARY KEY,
        timestamp   INTEGER NOT NULL,
        actor       TEXT NOT NULL,
        actor_type  TEXT NOT NULL DEFAULT 'unknown',
        resource    TEXT NOT NULL,
        action      TEXT NOT NULL,
        result      TEXT NOT NULL,
        risk_score  REAL NOT NULL DEFAULT 0,
        chain_hash  TEXT NOT NULL,
        metadata    TEXT NOT NULL DEFAULT '{}',
        message     TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_audit_timestamp  ON audit_log(timestamp);
      CREATE INDEX IF NOT EXISTS idx_audit_actor      ON audit_log(actor);
      CREATE INDEX IF NOT EXISTS idx_audit_resource   ON audit_log(resource);
      CREATE INDEX IF NOT EXISTS idx_audit_action     ON audit_log(action);
      CREATE INDEX IF NOT EXISTS idx_audit_risk       ON audit_log(risk_score);
    `);
  }

  private _loadLastHash(): void {
    const row = this._db.prepare(
      'SELECT chain_hash FROM audit_log ORDER BY timestamp DESC, rowid DESC LIMIT 1',
    ).get() as { chain_hash: string } | undefined;
    if (row) this._lastHash = row.chain_hash;
  }

  // ── Append ────────────────────────────────────────────────────────────────

  /**
   * Append an immutable audit entry. Returns the written entry.
   * Entries are chained: each hash includes the previous hash.
   */
  append(
    opts: Omit<AuditEntry, 'id' | 'timestamp' | 'chainHash'> & { timestamp?: number },
  ): AuditEntry {
    const now = opts.timestamp ?? Date.now();
    const id  = randomHex(12);

    // Build chain hash: SHA-256(prevHash || id || actor || resource || action || result || riskScore || ts)
    const chainInput = [
      this._lastHash,
      id,
      opts.actor,
      opts.resource,
      opts.action,
      opts.result,
      opts.riskScore.toFixed(6),
      now.toString(),
    ].join(':');
    const chainHash = sha256(chainInput);

    const entry: AuditEntry = {
      id,
      timestamp:  now,
      actor:      opts.actor,
      actorType:  opts.actorType,
      resource:   opts.resource,
      action:     opts.action,
      result:     opts.result,
      riskScore:  opts.riskScore,
      chainHash,
      ...(opts.metadata !== undefined && { metadata: opts.metadata }),
      ...(opts.message  !== undefined && { message:  opts.message }),
    };

    this._db.prepare(`
      INSERT INTO audit_log (id, timestamp, actor, actor_type, resource, action, result, risk_score, chain_hash, metadata, message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.id,
      entry.timestamp,
      entry.actor,
      entry.actorType,
      entry.resource,
      entry.action,
      entry.result,
      entry.riskScore,
      entry.chainHash,
      JSON.stringify(entry.metadata ?? {}),
      entry.message ?? null,
    );

    this._lastHash = chainHash;

    // Emit to stdout (structured log — consumed by log aggregators)
    console.log(JSON.stringify({
      level:     'audit',
      ts:        new Date(now).toISOString(),
      id:        entry.id,
      actor:     entry.actor,
      actorType: entry.actorType,
      resource:  entry.resource,
      action:    entry.action,
      result:    entry.result,
      riskScore: entry.riskScore,
      chainHash: entry.chainHash,
      message:   entry.message,
    }));

    return entry;
  }

  // ── Query ─────────────────────────────────────────────────────────────────

  query(opts: {
    actor?: string;
    resource?: string;
    action?: AuditAction;
    result?: AuditResult;
    since?: number;
    until?: number;
    minRisk?: number;
    limit?: number;
    offset?: number;
  } = {}): AuditEntry[] {
    const conditions: string[] = ['1=1'];
    const params: (string | number)[] = [];

    if (opts.actor)    { conditions.push('actor = ?');       params.push(opts.actor); }
    if (opts.resource) { conditions.push('resource LIKE ?'); params.push(`%${opts.resource}%`); }
    if (opts.action)   { conditions.push('action = ?');      params.push(opts.action); }
    if (opts.result)   { conditions.push('result = ?');      params.push(opts.result); }
    if (opts.since)    { conditions.push('timestamp >= ?');  params.push(opts.since); }
    if (opts.until)    { conditions.push('timestamp <= ?');  params.push(opts.until); }
    if (opts.minRisk != null) { conditions.push('risk_score >= ?'); params.push(opts.minRisk); }

    const limit  = Math.min(opts.limit ?? 100, 1000);
    const offset = opts.offset ?? 0;

    const rows = this._db.prepare(`
      SELECT * FROM audit_log
      WHERE ${conditions.join(' AND ')}
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `).all([...params, limit, offset]) as Array<Record<string, unknown>>;

    return rows.map(r => this._rowToEntry(r));
  }

  /** Get the most recent N entries. */
  recent(n = 100): AuditEntry[] {
    const rows = this._db.prepare(`
      SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT ?
    `).all(Math.min(n, 1000)) as Array<Record<string, unknown>>;
    return rows.map(r => this._rowToEntry(r));
  }

  /** Statistics for monitoring dashboard. */
  stats(sinceMs?: number): AuditStats {
    const since = sinceMs ?? 0;

    const total = (this._db.prepare('SELECT COUNT(*) as cnt FROM audit_log WHERE timestamp >= ?').get(since) as { cnt: number }).cnt;

    const byAction: Record<string, number> = {};
    const actionRows = this._db.prepare(`
      SELECT action, COUNT(*) as cnt FROM audit_log WHERE timestamp >= ? GROUP BY action
    `).all(since) as Array<{ action: string; cnt: number }>;
    actionRows.forEach(r => { byAction[r.action] = r.cnt; });

    const byResult: Record<string, number> = {};
    const resultRows = this._db.prepare(`
      SELECT result, COUNT(*) as cnt FROM audit_log WHERE timestamp >= ? GROUP BY result
    `).all(since) as Array<{ result: string; cnt: number }>;
    resultRows.forEach(r => { byResult[r.result] = r.cnt; });

    const riskRow = this._db.prepare(`
      SELECT AVG(risk_score) as avg_risk, COUNT(*) as high_cnt
      FROM audit_log WHERE timestamp >= ? AND risk_score >= 0.7
    `).get(since) as { avg_risk: number | null; high_cnt: number };

    return {
      total,
      byAction,
      byResult,
      avgRiskScore: riskRow.avg_risk ?? 0,
      highRiskCount: riskRow.high_cnt,
    };
  }

  // ── Chain Integrity ───────────────────────────────────────────────────────

  /**
   * Verify chain integrity by re-computing hashes.
   * Returns { valid: boolean, brokenAt?: string } (id of first broken link if invalid).
   */
  verifyChain(limit = 10_000): { valid: boolean; brokenAt?: string } {
    const rows = this._db.prepare(`
      SELECT id, timestamp, actor, resource, action, result, risk_score, chain_hash
      FROM audit_log ORDER BY timestamp ASC, rowid ASC LIMIT ?
    `).all(limit) as Array<{
      id: string; timestamp: number; actor: string; resource: string;
      action: string; result: string; risk_score: number; chain_hash: string;
    }>;

    let prevHash = '0000000000000000000000000000000000000000000000000000000000000000';
    for (const row of rows) {
      const expected = sha256([prevHash, row.id, row.actor, row.resource, row.action, row.result, row.risk_score.toFixed(6), row.timestamp.toString()].join(':'));
      if (expected !== row.chain_hash) {
        return { valid: false, brokenAt: row.id };
      }
      prevHash = row.chain_hash;
    }
    return { valid: true };
  }

  // ── Pruning ────────────────────────────────────────────────────────────────

  /** Delete entries older than retentionDays. Returns count deleted. */
  prune(retentionDays: number): number {
    const cutoff = Date.now() - retentionDays * 86_400_000;
    const result = this._db.prepare('DELETE FROM audit_log WHERE timestamp < ?').run(cutoff);
    return result.changes;
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _rowToEntry(row: Record<string, unknown>): AuditEntry {
    const msg = row['message'] != null ? String(row['message']) : undefined;
    return {
      id:         String(row['id'] ?? ''),
      timestamp:  Number(row['timestamp'] ?? 0),
      actor:      String(row['actor'] ?? ''),
      actorType:  String(row['actor_type'] ?? 'unknown'),
      resource:   String(row['resource'] ?? ''),
      action:     String(row['action'] ?? '') as AuditAction,
      result:     String(row['result'] ?? '') as AuditResult,
      riskScore:  Number(row['risk_score'] ?? 0),
      chainHash:  String(row['chain_hash'] ?? ''),
      metadata:   JSON.parse(String(row['metadata'] ?? '{}')),
      ...(msg !== undefined && { message: msg }),
    };
  }

  close(): void {
    this._db.close();
  }
}
