/**
 * GhostStack AI Vault — Audit Worker
 * Background worker for audit log maintenance:
 *   - Retention enforcement (prune entries older than max age)
 *   - Periodic stats logging
 *   - Optional mirror to GhostChain L1 (when enabled)
 *   - Log compression / archival
 *
 * GhostChain L1 (14000101) | L2 (901) | L3 (903) | GST gas token
 */

import { createHash } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { AuditLedger, AuditStats } from '../storage/audit-ledger.js';
import type { VaultConfig } from '../config/vault-config.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface AuditWorkerStats {
  pruneRuns:      number;
  totalPruned:    number;
  archiveRuns:    number;
  statsSnapshots: number;
  lastRunAt:      number | null;
}

// ── AuditWorker ────────────────────────────────────────────────────────────

export class AuditWorker {
  private readonly _audit:  AuditLedger;
  private readonly _config: VaultConfig;

  private _timer:      ReturnType<typeof setInterval> | undefined;
  private _statsTimer: ReturnType<typeof setInterval> | undefined;
  private _workerStats: AuditWorkerStats = {
    pruneRuns: 0, totalPruned: 0, archiveRuns: 0, statsSnapshots: 0, lastRunAt: null,
  };

  // Maintenance every 1 h; stats snapshot every 15 min
  private static readonly MAINTENANCE_INTERVAL_MS = 3_600_000;
  private static readonly STATS_INTERVAL_MS       = 15 * 60_000;



  constructor(audit: AuditLedger, config: VaultConfig) {
    this._audit  = audit;
    this._config = config;
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  start(): void {
    if (this._timer) return;

    // Stagger start 2 min in
    setTimeout(() => void this._maintenance(), 2 * 60_000);
    this._timer = setInterval(
      () => void this._maintenance(),
      AuditWorker.MAINTENANCE_INTERVAL_MS,
    );
    this._timer.unref?.();

    this._statsTimer = setInterval(
      () => this._snapshotStats(),
      AuditWorker.STATS_INTERVAL_MS,
    );
    this._statsTimer.unref?.();

    console.info('[AuditWorker] Started — maintenance every 1 h, stats every 15 min');
  }

  stop(): void {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = undefined;
    }
    if (this._statsTimer) {
      clearInterval(this._statsTimer);
      this._statsTimer = undefined;
    }
    console.info('[AuditWorker] Stopped');
  }

  workerStats(): AuditWorkerStats {
    return { ...this._workerStats };
  }

  // ── Maintenance Cycle ─────────────────────────────────────────────────────────

  private async _maintenance(): Promise<void> {
    this._workerStats.lastRunAt = Date.now();
    this._workerStats.pruneRuns++;

    try {
      const pruned = this._audit.prune(this._config.auditRetentionDays);
      this._workerStats.totalPruned += pruned;

      if (pruned > 0) {
        this._audit.append({
          actor: 'audit-worker', actorType: 'vault',
          resource: 'vault://audit/ledger',
          action: 'audit.prune', result: 'success',
          riskScore: 0,
          message: `Pruned ${pruned} entries older than ${this._config.auditRetentionDays} days`,
        });
        console.info(`[AuditWorker] Pruned ${pruned} entries`);
      }

      // Archive to disk (using snapshotDir as audit archive location)
      if (this._config.snapshotEnabled && this._config.snapshotDir) {
        await this._archiveLogs();
      }
    } catch (err) {
      console.error('[AuditWorker] Maintenance error:', err);
    }
  }

  // ── Stats Snapshot ─────────────────────────────────────────────────────────────

  private _snapshotStats(): void {
    try {
      const since = Date.now() - AuditWorker.STATS_INTERVAL_MS;
      const stats: AuditStats = this._audit.stats(since);
      this._workerStats.statsSnapshots++;

      // Log summary silently (debug level for production)
      if (stats.total > 0) {
        console.debug(
          `[AuditWorker] Stats (15min): total=${stats.total}`,
          `actions=${Object.keys(stats.byAction).length}`,
          `denied=${stats.byResult['denied'] ?? 0}`,
        );
      }
    } catch (err) {
      console.error('[AuditWorker] Stats snapshot error:', err);
    }
  }

  // ── Archive ───────────────────────────────────────────────────────────────────

  private async _archiveLogs(): Promise<void> {
    const archivePath = join(this._config.snapshotDir, 'audit-archive');
    const since = Date.now() - 86_400_000; // last 24 h
    const entries = this._audit.query({ since, limit: 50_000 });
    if (entries.length === 0) return;

    const date     = new Date().toISOString().slice(0, 10);
    const filename = `audit-${date}.ndjson`;
    const filepath = join(archivePath, filename);

    const ndjson = entries.map(e => JSON.stringify(e)).join('\n') + '\n';
    const hash   = createHash('sha256').update(ndjson).digest('hex');

    await mkdir(archivePath, { recursive: true });
    await writeFile(filepath, ndjson, 'utf8');
    await writeFile(`${filepath}.sha256`, hash, 'utf8');

    this._workerStats.archiveRuns++;
    console.info(`[AuditWorker] Archived ${entries.length} entries → ${filename} (sha256: ${hash.slice(0, 8)}…)`);
  }

  // ── Manual ops ───────────────────────────────────────────────────────────────

  async forceMaintenance(): Promise<void> {
    return this._maintenance();
  }

  currentStats(since?: number): AuditStats {
    return this._audit.stats(since ?? Date.now() - 3_600_000);
  }
}
