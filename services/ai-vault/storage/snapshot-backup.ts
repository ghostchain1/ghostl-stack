/**
 * GhostStack AI Vault — Snapshot & Backup
 * Encrypted vault snapshots with restore capability.
 * Snapshots are AES-256-GCM encrypted archives of the entire vault state.
 *
 * GhostChain L1 (14000101) | L2 (901) | L3 (903) | GST gas token
 */

import { createReadStream, createWriteStream, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGzip, createGunzip } from 'node:zlib';
import { encryptAesGcm, decryptAesGcm, SecureKey, sha256, randomHex } from '../core/crypto-engine.js';
import type { AuditLedger } from './audit-ledger.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface SnapshotManifest {
  id: string;
  timestamp: number;
  createdBy: string;
  files: Array<{ name: string; path: string; sizeBytes: number }>;
  checksum: string;  // SHA-256 of the snapshot payload
  encrypted: boolean;
}

export interface SnapshotResult {
  ok: boolean;
  snapshotId?: string;
  path?: string;
  error?: string;
}

// ── SnapshotBackup ─────────────────────────────────────────────────────────

export class SnapshotBackup {
  private readonly _dir: string;
  private readonly _key: SecureKey;
  private readonly _audit: AuditLedger;

  constructor(snapshotDir: string, masterKey: SecureKey, audit: AuditLedger) {
    this._dir   = resolve(snapshotDir);
    this._key   = masterKey;
    this._audit = audit;
    mkdirSync(this._dir, { recursive: true });
  }

  // ── Create Snapshot ────────────────────────────────────────────────────────

  async create(dbPaths: string[], initiatedBy = 'system'): Promise<SnapshotResult> {
    const id        = randomHex(12);
    const timestamp = Date.now();
    const snapshotDir = join(this._dir, id);
    mkdirSync(snapshotDir, { recursive: true });

    const fileEntries: SnapshotManifest['files'] = [];

    try {
      // Copy & compress each database file
      for (const dbPath of dbPaths) {
        const absPath = resolve(dbPath);
        try {
          const stat = statSync(absPath);
          const outName = `${id}-${encodeURIComponent(absPath.replace(/\//g, '_'))}.gz`;
          const outPath = join(snapshotDir, outName);

          await pipeline(
            createReadStream(absPath),
            createGzip({ level: 6 }),
            createWriteStream(outPath),
          );

          fileEntries.push({ name: outName, path: absPath, sizeBytes: stat.size });
        } catch {
          // DB file may not exist yet — skip
        }
      }

      // Read all snapshot data and compute checksum
      const allData = Buffer.concat(
        await Promise.all(fileEntries.map(f => readFile(join(snapshotDir, f.name)))),
      );
      const checksum = sha256(allData);

      const manifest: SnapshotManifest = {
        id,
        timestamp,
        createdBy: initiatedBy,
        files: fileEntries,
        checksum,
        encrypted: true,
      };

      // Encrypt the manifest
      const manifestBlob = encryptAesGcm(this._key, JSON.stringify(manifest));
      await writeFile(join(snapshotDir, 'manifest.enc'), JSON.stringify(manifestBlob), 'utf8');

      // Encrypt each file
      for (const entry of fileEntries) {
        const raw  = await readFile(join(snapshotDir, entry.name));
        const blob = encryptAesGcm(this._key, raw, Buffer.from(entry.name, 'utf8'));
        await writeFile(join(snapshotDir, `${entry.name}.enc`), JSON.stringify(blob), 'utf8');
        // Remove unencrypted compressed file
        rmSync(join(snapshotDir, entry.name), { force: true });
      }

      this._audit.append({
        actor: initiatedBy,
        actorType: 'system',
        resource: snapshotDir,
        action: 'snapshot.create',
        result: 'success',
        riskScore: 0,
        message: `Snapshot ${id} created with ${fileEntries.length} files`,
      });

      return { ok: true, snapshotId: id, path: snapshotDir };
    } catch (err) {
      this._audit.append({
        actor: initiatedBy,
        actorType: 'system',
        resource: snapshotDir,
        action: 'snapshot.create',
        result: 'failure',
        riskScore: 0.3,
        message: (err as Error).message,
      });
      // Clean up partial snapshot
      rmSync(snapshotDir, { recursive: true, force: true });
      return { ok: false, error: (err as Error).message };
    }
  }

  // ── Restore Snapshot ───────────────────────────────────────────────────────

  async restore(snapshotId: string, targetDir: string, initiatedBy = 'system'): Promise<SnapshotResult> {
    const snapshotDir = join(this._dir, snapshotId);
    const absTarget   = resolve(targetDir);

    try {
      // Decrypt manifest
      const manifestEnc = JSON.parse(await readFile(join(snapshotDir, 'manifest.enc'), 'utf8'));
      const manifestBuf = decryptAesGcm(this._key, manifestEnc);
      const manifest: SnapshotManifest = JSON.parse(manifestBuf.toString('utf8'));

      mkdirSync(absTarget, { recursive: true });

      // Decrypt & restore each file
      for (const entry of manifest.files) {
        const encBuf = JSON.parse(await readFile(join(snapshotDir, `${entry.name}.enc`), 'utf8'));
        const raw    = decryptAesGcm(this._key, encBuf, Buffer.from(entry.name, 'utf8'));
        const outGz  = join(absTarget, entry.name);
        await writeFile(outGz, raw);

        // Decompress
        const outPath = join(absTarget, entry.name.replace(/\.gz$/, ''));
        await pipeline(createReadStream(outGz), createGunzip(), createWriteStream(outPath));
        rmSync(outGz, { force: true });
      }

      this._audit.append({
        actor: initiatedBy,
        actorType: 'system',
        resource: snapshotDir,
        action: 'snapshot.restore',
        result: 'success',
        riskScore: 0.5,
        message: `Snapshot ${snapshotId} restored to ${absTarget}`,
      });

      return { ok: true, snapshotId, path: absTarget };
    } catch (err) {
      this._audit.append({
        actor: initiatedBy,
        actorType: 'system',
        resource: snapshotDir,
        action: 'snapshot.restore',
        result: 'failure',
        riskScore: 0.6,
        message: (err as Error).message,
      });
      return { ok: false, error: (err as Error).message };
    }
  }

  // ── List Snapshots ─────────────────────────────────────────────────────────

  list(): Array<{ id: string; timestamp: number; hasManifest: boolean }> {
    try {
      return readdirSync(this._dir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => {
          const hasManifest = (() => {
            try { statSync(join(this._dir, d.name, 'manifest.enc')); return true; } catch { return false; }
          })();
          return { id: d.name, timestamp: statSync(join(this._dir, d.name)).mtimeMs, hasManifest };
        })
        .sort((a, b) => b.timestamp - a.timestamp);
    } catch {
      return [];
    }
  }

  /** Prune old snapshots, keeping only the last N. */
  pruneOld(keepCount = 10): void {
    const all = this.list();
    if (all.length <= keepCount) return;
    const toDelete = all.slice(keepCount);
    for (const snap of toDelete) {
      rmSync(join(this._dir, snap.id), { recursive: true, force: true });
    }
  }
}
