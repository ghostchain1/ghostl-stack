/**
 * GhostStack AI Vault — Sequencer Key Manager
 * Manages OP Stack sequencer keys for GhostL2 (chain_id=901) and GhostL3 (chain_id=903).
 *
 * Sequencers sign batches and state roots anchored to GhostChain L1.
 * Keys are never exposed outside secure memory.
 * AI-enhanced monitoring watches for sequencer key abuse patterns.
 *
 * GhostChain L1 (14000101) | L2 (901) | L3 (903) | GST gas token
 */

import type { KeyManager, SignResult } from '../core/key-manager.js';
import type { AuditLedger } from '../storage/audit-ledger.js';
import type { SecurityBrain } from '../ai/security-brain.js';

// ── Types ──────────────────────────────────────────────────────────────────

export type SequencerLayer = 'l2' | 'l3';

export const SEQUENCER_CHAIN_IDS: Record<SequencerLayer, number> = {
  l2: 901,
  l3: 903,
};

export interface SequencerSignRequest {
  layer: SequencerLayer;
  batchId: string;
  stateRootHex: string;
  messageHex: string;
  actor: string;
}

export interface SequencerSignResult extends SignResult {
  layer: SequencerLayer;
  chainId: number;
  batchId: string;
}

// ── SequencerKeyManager ────────────────────────────────────────────────────

export class SequencerKeyManager {
  private readonly _keyMgr: KeyManager;
  private readonly _audit:  AuditLedger;
  private readonly _brain:  SecurityBrain;

  private readonly _activeKeys = new Map<SequencerLayer, string>();

  constructor(keyMgr: KeyManager, audit: AuditLedger, brain: SecurityBrain) {
    this._keyMgr = keyMgr;
    this._audit  = audit;
    this._brain  = brain;
  }

  // ── Generate ───────────────────────────────────────────────────────────────

  async generateSequencerKey(layer: SequencerLayer, actor = 'system'): Promise<string> {
    const chainId = SEQUENCER_CHAIN_IDS[layer];

    const record = await this._keyMgr.generate({
      name:      `sequencer-${layer}-${Date.now()}`,
      purpose:   'sequencer',
      algorithm: 'ed25519',
      layer,
      chainId,
      actor,
      metadata: { component: 'sequencer-key-manager', chainId: String(chainId) },
    });

    this._activeKeys.set(layer, record.id);

    this._audit.append({
      actor, actorType: 'vault', resource: `vault://sequencer/${layer}/key`,
      action: 'key.generate', result: 'success', riskScore: 0,
      message: `Sequencer key generated for ${layer} (chainId=${chainId})`,
    });

    return record.id;
  }

  // ── Signing ────────────────────────────────────────────────────────────────

  /**
   * Sign a batch state root for submission to the parent chain.
   * GhostL2 sequencer → submits to GhostChain L1.
   * GhostL3 sequencer → submits to GhostL2.
   */
  async signBatch(req: SequencerSignRequest): Promise<SequencerSignResult> {
    this._checkSecurity(req.actor, `vault://sequencer/${req.layer}/key`);

    const keyId = this._activeKeys.get(req.layer);
    if (!keyId) throw new Error(`No active sequencer key for layer ${req.layer}`);

    const signResult = await this._keyMgr.sign(keyId, Buffer.from(req.messageHex, 'hex'), req.actor);

    this._audit.append({
      actor: req.actor, actorType: 'vault',
      resource: `vault://sequencer/${req.layer}/key/${keyId}`,
      action: 'key.sign', result: 'success', riskScore: 0,
      message: `Batch signed (layer=${req.layer}, batchId=${req.batchId})`,
    });

    return {
      ...signResult,
      layer:   req.layer,
      chainId: SEQUENCER_CHAIN_IDS[req.layer],
      batchId: req.batchId,
    };
  }

  // ── Rotation ───────────────────────────────────────────────────────────────

  async rotateSequencerKey(layer: SequencerLayer, actor = 'system', reason = 'scheduled'): Promise<string> {
    const oldKeyId = this._activeKeys.get(layer);
    if (oldKeyId) await this._keyMgr.revoke(oldKeyId, actor);

    const newKeyId = await this.generateSequencerKey(layer, actor);

    this._brain.recordRotation(
      `vault://sequencer/${layer}/key`,
      reason === 'scheduled' ? 'scheduled' : 'threat_detected',
      'urgent',
    );

    this._audit.append({
      actor, actorType: 'vault', resource: `vault://sequencer/${layer}/key`,
      action: 'key.rotate', result: 'success', riskScore: 0,
      message: `Sequencer key rotated (layer=${layer}, reason=${reason})`,
    });

    return newKeyId;
  }

  // ── Query ──────────────────────────────────────────────────────────────────

  getActiveKeyId(layer: SequencerLayer): string | undefined {
    return this._activeKeys.get(layer);
  }

  // ── Security ───────────────────────────────────────────────────────────────

  private _checkSecurity(actor: string, resource: string): void {
    const verdict = this._brain.analyze({
      actorId: actor, resource,
      action: 'key.sign', success: true, ts: Date.now(),
    });
    if (!verdict.allow) {
      throw new Error(`Sequencer signing denied by AI: ${verdict.message}`);
    }
  }
}
