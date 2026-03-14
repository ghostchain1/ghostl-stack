/**
 * GhostStack AI Vault — Rotation Worker
 * Background worker that runs full rotation sweeps on a schedule.
 *
 * - Coordinate key rotations via KeyManager
 * - Coordinate secret rotations via SecretManager
 * - Delegates rotation decisions to SecurityBrain.evaluateRotations()
 * - Logs every action to AuditLedger
 *
 * Designed to run independently from KeyRotationAgent — this worker handles
 * the heavy-lifting batch execution while the agent handles alert/notification flow.
 *
 * GhostChain L1 (14000101) | L2 (901) | L3 (903) | GST gas token
 */

import type { KeyManager } from '../core/key-manager.js';
import type { SecretManager } from '../core/secret-manager.js';
import type { SecurityBrain } from '../ai/security-brain.js';
import type { AuditLedger } from '../storage/audit-ledger.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface RotationResult {
  path:    string;
  type:    'key' | 'secret';
  success: boolean;
  reason:  string;
  ts:      number;
}

export interface RotationWorkerStats {
  rotationsRun:     number;
  keyRotations:     number;
  secretRotations:  number;
  failures:         number;
  lastSweepAt:      number | null;
  nextSweepAt:      number | null;
}

// ── RotationWorker ─────────────────────────────────────────────────────────

export class RotationWorker {
  private readonly _keyMgr:    KeyManager;
  private readonly _secretMgr: SecretManager;
  private readonly _brain:     SecurityBrain;
  private readonly _audit:     AuditLedger;

  private _timer:   ReturnType<typeof setInterval> | undefined;
  private _running  = false;

  private _stats: RotationWorkerStats = {
    rotationsRun: 0, keyRotations: 0, secretRotations: 0,
    failures: 0, lastSweepAt: null, nextSweepAt: null,
  };

  private static readonly SWEEP_INTERVAL_MS = 10 * 60_000;  // 10 min

  constructor(
    keyMgr: KeyManager,
    secretMgr: SecretManager,
    brain: SecurityBrain,
    audit: AuditLedger,
  ) {
    this._keyMgr    = keyMgr;
    this._secretMgr = secretMgr;
    this._brain     = brain;
    this._audit     = audit;
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  start(): void {
    if (this._timer) return;
    this._stats.nextSweepAt = Date.now() + 30_000;
    setTimeout(() => void this._sweep(), 30_000);
    this._timer = setInterval(() => void this._sweep(), RotationWorker.SWEEP_INTERVAL_MS);
    this._timer.unref?.();
    console.info('[RotationWorker] Started — sweep every 10 min');
  }

  stop(): void {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = undefined;
    }
    console.info('[RotationWorker] Stopped');
  }

  stats(): RotationWorkerStats {
    return { ...this._stats };
  }

  // ── Force run ────────────────────────────────────────────────────────────────

  async forceSweep(): Promise<RotationResult[]> {
    return this._sweep();
  }

  // ── Sweep ──────────────────────────────────────────────────────────────────

  private async _sweep(): Promise<RotationResult[]> {
    if (this._running) return [];
    this._running      = true;
    this._stats.lastSweepAt  = Date.now();
    this._stats.nextSweepAt  = Date.now() + RotationWorker.SWEEP_INTERVAL_MS;

    const results: RotationResult[] = [];

    try {
      // Collect all active key and secret paths with rotation metadata
      const keyRecords    = this._keyMgr.list({ state: 'active' });
      const secretMetas   = this._secretMgr.list();
      const now           = Date.now();

      const items: Array<{ path: string; lastRotatedAt: number; riskScore?: number }> = [
        ...keyRecords.map(k => ({
          path:          k.secretPath,
          lastRotatedAt: k.rotatedAt ?? k.createdAt,
          riskScore:     k.riskScore,
        })),
        ...secretMetas.map(m => ({
          path:          m.path,
          lastRotatedAt: m.rotatedAt ?? m.createdAt,
        })),
      ];

      const decisions = this._brain.evaluateRotations(items);

      for (const decision of decisions) {
        if (!decision.shouldRotate) continue;

        // Determine type from path convention
        const isKey = keyRecords.some(k => k.secretPath === decision.path);
        const result = isKey
          ? await this._rotateKey(decision.path, decision.reason, keyRecords)
          : await this._rotateSecret(decision.path, decision.reason);

        results.push(result);
        this._stats.rotationsRun++;
        if (isKey) this._stats.keyRotations++;
        else       this._stats.secretRotations++;
        if (!result.success) this._stats.failures++;
      }

      if (results.length > 0) {
        console.info(`[RotationWorker] Sweep: ${results.length} rotations (${results.filter(r => r.success).length} ok, ${results.filter(r => !r.success).length} failed)`);
      }
    } catch (err) {
      console.error('[RotationWorker] Sweep error:', err);
    } finally {
      this._running = false;
    }

    return results;
  }

  private async _rotateKey(
    path: string,
    reason: string,
    keyRecords: Array<{ id: string; secretPath: string }>,
  ): Promise<RotationResult> {
    const ts  = Date.now();
    const rec = keyRecords.find(k => k.secretPath === path);
    if (!rec) {
      return { path, type: 'key', success: false, reason: 'key record not found', ts };
    }
    try {
      const result = await this._keyMgr.rotate(rec.id, 'rotation-worker', reason);
      this._audit.append({
        actor: 'rotation-worker', actorType: 'vault',
        resource: path, action: 'key.rotate', result: result.ok ? 'success' : 'failure',
        riskScore: 0.1, message: result.ok ? reason : (result.error ?? 'rotation failed'),
      });
      return { path, type: 'key', success: result.ok, reason: result.ok ? reason : (result.error ?? ''), ts };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this._audit.append({
        actor: 'rotation-worker', actorType: 'vault',
        resource: path, action: 'key.rotate', result: 'failure',
        riskScore: 0.4, message: msg,
      });
      return { path, type: 'key', success: false, reason: msg, ts };
    }
  }

  private async _rotateSecret(path: string, reason: string): Promise<RotationResult> {
    const ts = Date.now();
    try {
      await this._secretMgr.rotate(path, { actor: 'rotation-worker', reason });
      this._audit.append({
        actor: 'rotation-worker', actorType: 'vault',
        resource: path, action: 'secret.rotate', result: 'success',
        riskScore: 0.1, message: reason,
      });
      return { path, type: 'secret', success: true, reason, ts };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this._audit.append({
        actor: 'rotation-worker', actorType: 'vault',
        resource: path, action: 'secret.rotate', result: 'failure',
        riskScore: 0.4, message: msg,
      });
      return { path, type: 'secret', success: false, reason: msg, ts };
    }
  }
}
