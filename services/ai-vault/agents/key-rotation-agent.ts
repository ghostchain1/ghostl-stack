/**
 * GhostStack AI Vault — Key Rotation Agent
 * Autonomous agent that periodically evaluates all keys and secrets
 * and triggers rotation based on AI recommendations.
 *
 * Schedule: runs every 5 minutes for a fast sweep.
 * Delegates rotation decisions to SecretRotationAI inside SecurityBrain.
 * Actual rotation is performed by SecretManager and KeyManager.
 *
 * GhostChain L1 (14000101) | L2 (901) | L3 (903) | GST gas token
 */

import type { KeyManager } from '../core/key-manager.js';
import type { SecretManager } from '../core/secret-manager.js';
import type { SecurityBrain } from '../ai/security-brain.js';
import type { AuditLedger } from '../storage/audit-ledger.js';
import type { RotationDecision } from '../ai/secret-rotation-ai.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface RotationResult {
  path: string;
  ok: boolean;
  urgency: RotationDecision['urgency'];
  reason: RotationDecision['reason'];
  error?: string;
  ts: number;
}

type RotationListener = (results: RotationResult[]) => void | Promise<void>;

// ── KeyRotationAgent ───────────────────────────────────────────────────────

export class KeyRotationAgent {
  private readonly _keyMgr:    KeyManager;
  private readonly _secretMgr: SecretManager;
  private readonly _brain:     SecurityBrain;
  private readonly _audit:     AuditLedger;
  private readonly _listeners: RotationListener[] = [];

  private _timer: ReturnType<typeof setInterval> | undefined;

  // Rotation registry: path → lastRotated ms
  private readonly _lastRotated = new Map<string, number>();

  // Cache of key records for secret-path→ID lookup during rotation
  private _keyRecordCache: Array<{ id: string; secretPath: string; riskScore: number }> = [];

  private static readonly SWEEP_INTERVAL_MS = 5 * 60_000;  // 5 minutes

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
    this._timer = setInterval(() => void this._sweep(), KeyRotationAgent.SWEEP_INTERVAL_MS);
    this._timer.unref?.();
    // Run immediately on start
    setTimeout(() => void this._sweep(), 2_000);
    console.info('[KeyRotationAgent] Started — autonomous rotation active');
  }

  stop(): void {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = undefined;
    }
    console.info('[KeyRotationAgent] Stopped');
  }

  onRotation(listener: RotationListener): void {
    this._listeners.push(listener);
  }

  /**
   * Force an immediate rotation for a specific path.
   */
  async forceRotate(path: string, actor = 'system'): Promise<RotationResult> {
    return this._rotate(path, {
      path,
      shouldRotate: true,
      urgency:      'urgent',
      reason:       'manual',
      scheduledAt:  Date.now(),
      riskScore:    0.5,
      evidence:     ['Manual rotation requested'],
    }, actor);
  }

  // ── Sweep ────────────────────────────────────────────────────────────────────

  private async _sweep(): Promise<void> {
    try {
      // Build item list from key DB + secret store
      const keyRecords  = this._keyMgr.list({ state: 'active' });
      const secretMetas = this._secretMgr.list();

      const keyItems = keyRecords.map(k => ({
        path: k.secretPath,
        lastRotatedAt: k.rotatedAt ?? (this._lastRotated.get(k.secretPath) ?? Date.now() - 7 * 86_400_000),
        riskScore: k.riskScore,
      }));
      const secretItems = secretMetas.map(m => ({
        path: m.path,
        lastRotatedAt: m.rotatedAt ?? (this._lastRotated.get(m.path) ?? Date.now() - 7 * 86_400_000),
      }));

      // Store key records for lookup in _rotate()
      this._keyRecordCache = keyRecords;

      const allItems = [...keyItems, ...secretItems];
      if (allItems.length === 0) return;

      const decisions = this._brain.evaluateRotations(allItems);

      if (decisions.length === 0) return;

      console.info(`[KeyRotationAgent] Sweep: ${decisions.length} rotation(s) needed`);

      const results: RotationResult[] = [];
      for (const decision of decisions) {
        const result = await this._rotate(decision.path, decision, 'key-rotation-agent');
        results.push(result);
      }

      if (results.length > 0) {
        for (const listener of this._listeners) {
          try { await listener(results); } catch { /* non-fatal */ }
        }
      }
    } catch (err) {
      console.error('[KeyRotationAgent] Sweep error:', err);
    }
  }

  private async _rotate(path: string, decision: RotationDecision, actor: string): Promise<RotationResult> {
    const now = Date.now();

    // Don't rotate before scheduled time (for non-emergency)
    if (decision.urgency !== 'emergency' && decision.scheduledAt > now + 30_000) {
      return { path, ok: true, urgency: decision.urgency, reason: decision.reason, ts: now };
    }

    try {
      if (path.startsWith('vault://validator') || path.startsWith('vault://bridge') ||
            path.startsWith('vault://treasury') || path.startsWith('vault://sequencer') ||
            path.startsWith('vault://keys/')) {
          // Blockchain keys — rotate by ID
          const rec = (this._keyRecordCache ?? []).find(k => k.secretPath === path);
          if (rec) {
            await this._keyMgr.rotate(rec.id, actor, decision.reason);
          }
        } else {
          // Regular secrets — generate new random value
          await this._secretMgr.rotate(path, { actor, actorType: 'vault', reason: decision.reason });

      this._lastRotated.set(path, Date.now());
      this._brain.recordRotation(path, decision.reason, decision.urgency);

      this._audit.append({
        actor, actorType: 'vault', resource: path,
        action: 'secret.rotate', result: 'success', riskScore: decision.riskScore,
        message: `Rotation complete: ${decision.reason} (urgency=${decision.urgency}, risk=${decision.riskScore.toFixed(2)})`,
      });

      return { path, ok: true, urgency: decision.urgency, reason: decision.reason, ts: Date.now() };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error(`[KeyRotationAgent] Rotation failed for ${path}: ${error}`);

      this._audit.append({
        actor, actorType: 'vault', resource: path,
        action: 'secret.rotate', result: 'failure', riskScore: decision.riskScore,
        message: `Rotation failed: ${error}`,
      });

      return { path, ok: false, urgency: decision.urgency, reason: decision.reason, error, ts: Date.now() };
    }
  }
}
