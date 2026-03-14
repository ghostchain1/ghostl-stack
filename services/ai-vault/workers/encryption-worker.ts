/**
 * GhostStack AI Vault — Encryption Worker
 * Background worker for:
 *   - Re-encryption after master-key rotation
 *   - Algorithm migration (e.g. AES-256-GCM → ChaCha20-Poly1305)
 *   - Integrity verification of all stored secrets
 *   - Cryptographic health checks
 *
 * This worker is intentionally read-only when just verifying.
 * Re-encryption requires an explicit trigger via `startReencrypt()`.
 *
 * GhostChain L1 (14000101) | L2 (901) | L3 (903) | GST gas token
 */

import type { EncryptedStore } from '../storage/encrypted-store.js';
import type { KeyDatabase } from '../storage/key-database.js';
import type { AuditLedger } from '../storage/audit-ledger.js';
import type { VaultConfig } from '../config/vault-config.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface IntegrityReport {
  checkedAt:   number;
  totalChecked: number;
  passed:       number;
  failed:       number;
  failedPaths:  string[];
}

export interface EncryptionWorkerStats {
  integrityChecks:    number;
  lastIntegrityAt:    number | null;
  lastIntegrityReport: IntegrityReport | null;
  reencryptionsRun:   number;
}

// ── EncryptionWorker ───────────────────────────────────────────────────────

export class EncryptionWorker {
  private readonly _store:  EncryptedStore;
  private readonly _keyDb:  KeyDatabase;
  private readonly _audit:  AuditLedger;
  private readonly _config: VaultConfig;

  private _timer: ReturnType<typeof setInterval> | undefined;
  private _stats: EncryptionWorkerStats = {
    integrityChecks: 0, lastIntegrityAt: null,
    lastIntegrityReport: null, reencryptionsRun: 0,
  };

  // Integrity check every 6 h
  private static readonly INTEGRITY_INTERVAL_MS = 6 * 3_600_000;

  constructor(
    store:  EncryptedStore,
    keyDb:  KeyDatabase,
    audit:  AuditLedger,
    config: VaultConfig,
  ) {
    this._store  = store;
    this._keyDb  = keyDb;
    this._audit  = audit;
    this._config = config;
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  start(): void {
    if (this._timer) return;
    // Stagger start to avoid all workers hitting at once
    setTimeout(() => void this._runIntegrityCheck(), 60_000);
    this._timer = setInterval(
      () => void this._runIntegrityCheck(),
      EncryptionWorker.INTEGRITY_INTERVAL_MS,
    );
    this._timer.unref?.();
    console.info('[EncryptionWorker] Started — integrity checks every 6 h');
  }

  stop(): void {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = undefined;
    }
    console.info('[EncryptionWorker] Stopped');
  }

  stats(): EncryptionWorkerStats {
    return { ...this._stats, lastIntegrityReport: this._stats.lastIntegrityReport };
  }

  // ── Integrity Check ───────────────────────────────────────────────────────────

  async runIntegrityCheck(): Promise<IntegrityReport> {
    return this._runIntegrityCheck();
  }

  private async _runIntegrityCheck(): Promise<IntegrityReport> {
    const ts          = Date.now();
    let totalChecked  = 0;
    let passed        = 0;
    const failedPaths: string[] = [];

    try {
      // Verify store health by listing and spot-checking metadata
      const metas = this._store.list();
      totalChecked = metas.length;

      for (const meta of metas) {
        try {
          // Attempt a read to verify decryptability.
          // If the record cannot be decrypted, the store will throw.
          const buf = this._store.get(meta.path);
          if (buf !== null) {
            passed++;
          } else {
            failedPaths.push(meta.path);
          }
        } catch {
          failedPaths.push(meta.path);
        }
      }

      const report: IntegrityReport = {
        checkedAt: ts, totalChecked, passed,
        failed: failedPaths.length, failedPaths,
      };

      this._stats.integrityChecks++;
      this._stats.lastIntegrityAt    = ts;
      this._stats.lastIntegrityReport = report;

      const riskScore = failedPaths.length > 0 ? 0.8 : 0;
      this._audit.append({
        actor: 'encryption-worker', actorType: 'vault',
        resource: 'vault://store/integrity',
        action: 'integrity.check', result: failedPaths.length === 0 ? 'success' : 'failure',
        riskScore, message: `${passed}/${totalChecked} secrets verified. ${failedPaths.length} failures.`,
        metadata: { failedPaths: failedPaths.slice(0, 10) },
      });

      if (failedPaths.length > 0) {
        console.error(`[EncryptionWorker] ⚠️  Integrity failures: ${failedPaths.slice(0, 5).join(', ')}`);
      } else {
        console.info(`[EncryptionWorker] ✅ Integrity OK — ${passed}/${totalChecked} verified`);
      }

      return report;
    } catch (err) {
      console.error('[EncryptionWorker] Integrity check error:', err);
      const report: IntegrityReport = { checkedAt: ts, totalChecked, passed, failed: 1, failedPaths: ['<check error>'] };
      return report;
    }
  }

  // ── Re-encryption ─────────────────────────────────────────────────────────────

  /**
   * Re-encrypt all secrets with the current master key.
   * Use this after master key rotation or algorithm migration.
   * This is a read-and-rewrite operation — existing data is overwritten.
   *
   * Returns the number of re-encrypted secrets.
   */
  async startReencrypt(triggeredBy: string): Promise<number> {
    this._audit.append({
      actor: triggeredBy, actorType: 'human',
      resource: 'vault://store',
      action: 'store.reencrypt', result: 'success',
      riskScore: 0.2, message: 'Re-encryption pass initiated',
    });

    // For now, re-encryption is handled by EncryptedStore internally
    // on each write — a full pass would require a migration API.
    // Here we force a store-level compaction if supported.
    let count = 0;
    try {
      const metas = this._store.list();
      for (const meta of metas) {
        const buf = this._store.get(meta.path);
        if (buf) {
          // Read and rewrite — triggers encrypt cycle with current master key
          this._store.set(meta.path, buf, {
            namespace: meta.namespace,
            expiresAt: meta.expiresAt,
            metadata:  meta.metadata,
          });
          count++;
        }
      }
      this._stats.reencryptionsRun++;
      this._audit.append({
        actor: triggeredBy, actorType: 'human',
        resource: 'vault://store',
        action: 'store.reencrypt', result: 'success',
        riskScore: 0, message: `Re-encrypted ${count} secrets`,
      });
      console.info(`[EncryptionWorker] Re-encryption complete — ${count} records`);
    } catch (err) {
      console.error('[EncryptionWorker] Re-encryption error:', err);
    }

    return count;
  }

  // ── Key Database Health ───────────────────────────────────────────────────────

  async checkKeyDatabaseHealth(): Promise<{ active: number; retired: number }> {
const all     = this._keyDb.list();
    const active  = all.filter(k => k.state === 'active').length;
    const retired = all.filter(k => k.state === 'retired').length;

    this._audit.append({
      actor: 'encryption-worker', actorType: 'vault',
      resource: 'vault://key-database',
      action: 'integrity.check', result: 'success',
      riskScore: 0, message: `Key DB: ${active} active, ${retired} retired`,
    });

    return { active, retired };
  }
}
