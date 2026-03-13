/**
 * GhostStack AI Vault — Validator Key Guardian
 * Protects and manages GhostChain validator keys across L1, L2, and L3.
 *
 * Key lifecycle:
 *   generate → encrypt → store → sign → monitor → rotate → retire
 *
 * Keys NEVER leave secure memory in plaintext.
 * All signing happens inside the vault; the raw private key is never returned.
 *
 * GhostChain L1 (chain_id=14000101) | L2 (chain_id=901) | L3 (chain_id=903)
 * Gas token: GST
 */

import type { KeyManager, SignResult } from '../core/key-manager.js';
import type { AuditLedger } from '../storage/audit-ledger.js';
import type { SecurityBrain } from '../ai/security-brain.js';
import type { KeyRecord } from '../storage/key-database.js';

// ── Types ──────────────────────────────────────────────────────────────────

export type ValidatorLayer = 'l1' | 'l2' | 'l3';

export const VALIDATOR_CHAIN_IDS: Record<ValidatorLayer, number> = {
  l1: 14000101,
  l2: 901,
  l3: 903,
};

export interface ValidatorKeyMeta {
  keyId: string;
  layer: ValidatorLayer;
  chainId: number;
  publicKey: string;
  createdAt: number;
  rotatedAt?: number;
  riskScore: number;
  state: 'active' | 'rotating' | 'retired' | 'compromised';
}

export interface ValidatorSignRequest {
  keyId: string;
  layer: ValidatorLayer;
  messageHex: string;   // hex-encoded message to sign
  actor: string;        // requesting actor id
}

export interface ValidatorSignResult extends SignResult {
  layer: ValidatorLayer;
  chainId: number;
}

// ── ValidatorKeyGuardian ───────────────────────────────────────────────────

export class ValidatorKeyGuardian {
  private readonly _keyMgr: KeyManager;
  private readonly _audit:  AuditLedger;
  private readonly _brain:  SecurityBrain;

  // Registry: layer → active key ID
  private readonly _activeKeys = new Map<ValidatorLayer, string>();

  constructor(keyMgr: KeyManager, audit: AuditLedger, brain: SecurityBrain) {
    this._keyMgr = keyMgr;
    this._audit  = audit;
    this._brain  = brain;
  }

  // ── Key Generation ─────────────────────────────────────────────────────────

  /**
   * Generate a new validator key for the specified layer.
   * The private key is immediately encrypted and stored in the vault.
   */
  async generateValidatorKey(layer: ValidatorLayer, actor = 'system'): Promise<ValidatorKeyMeta> {
    const chainId = VALIDATOR_CHAIN_IDS[layer];
    const name    = `validator-${layer}-${Date.now()}`;

    const record = await this._keyMgr.generate({
      name,
      purpose:   'validator',
      algorithm: 'ed25519',
      layer,
      chainId,
      actor,
      metadata: {
        component: 'validator-key-guardian',
        chainId:   String(chainId),
      },
    });

    this._activeKeys.set(layer, record.id);

    this._audit.append({
      actor, actorType: 'vault', resource: `vault://validator/${layer}/key`,
      action: 'key.generate', result: 'success', riskScore: 0,
      message: `Validator key generated for ${layer} (chainId=${chainId})`,
    });

    return this._toMeta(record, layer);
  }

  // ── Signing ────────────────────────────────────────────────────────────────

  /**
   * Sign a validator vote or block proposal. The private key stays in memory.
   * AI security check runs before every signing operation.
   */
  async signValidatorVote(req: ValidatorSignRequest): Promise<ValidatorSignResult> {
    this._checkSecurity(req.actor, `vault://validator/${req.layer}/key`);

    const signResult = await this._keyMgr.sign(req.keyId, Buffer.from(req.messageHex, 'hex'), req.actor);

    this._audit.append({
      actor: req.actor, actorType: 'validator',
      resource: `vault://validator/${req.layer}/key/${req.keyId}`,
      action: 'key.sign', result: 'success', riskScore: 0,
      message: `Validator vote signed (layer=${req.layer})`,
    });

    return {
      ...signResult,
      layer:   req.layer,
      chainId: VALIDATOR_CHAIN_IDS[req.layer],
    };
  }

  /**
   * Sign an arbitrary block for the given layer (used by OP Stack proposers).
   */
  async signBlock(layer: ValidatorLayer, blockHashHex: string, actor: string): Promise<ValidatorSignResult> {
    const keyId = this._activeKeys.get(layer);
    if (!keyId) throw new Error(`No active validator key for layer ${layer}`);
    return this.signValidatorVote({ keyId, layer, messageHex: blockHashHex, actor });
  }

  // ── Rotation ───────────────────────────────────────────────────────────────

  /**
   * Rotate the validator key for a layer. The old key is retired gracefully
   * after the new key takes over.
   */
  async rotateValidatorKey(layer: ValidatorLayer, actor = 'system', reason = 'scheduled'): Promise<ValidatorKeyMeta> {
    const oldKeyId = this._activeKeys.get(layer);

    if (oldKeyId) {
      await this._keyMgr.revoke(oldKeyId, actor);
      this._audit.append({
        actor, actorType: 'vault', resource: `vault://validator/${layer}/key/${oldKeyId}`,
        action: 'key.rotate', result: 'success', riskScore: 0,
        message: `Old validator key retired (reason: ${reason})`,
      });
    }

    const newMeta = await this.generateValidatorKey(layer, actor);

    this._brain.recordRotation(
      `vault://validator/${layer}/key`,
      reason === 'scheduled' ? 'scheduled' : 'threat_detected',
      'urgent',
    );

    return newMeta;
  }

  // ── Query ──────────────────────────────────────────────────────────────────

  getActiveKeyId(layer: ValidatorLayer): string | undefined {
    return this._activeKeys.get(layer);
  }

  async getKeyMeta(layer: ValidatorLayer): Promise<ValidatorKeyMeta | undefined> {
    const keyId = this._activeKeys.get(layer);
    if (!keyId) return undefined;
    const record = this._keyMgr.getById(keyId);
    if (!record) return undefined;
    return this._toMeta(record, layer);
  }

  async getAllValidatorKeys(): Promise<ValidatorKeyMeta[]> {
    const layers: ValidatorLayer[] = ['l1', 'l2', 'l3'];
    const results: ValidatorKeyMeta[] = [];
    for (const layer of layers) {
      const meta = await this.getKeyMeta(layer);
      if (meta) results.push(meta);
    }
    return results;
  }

  // ── Security ───────────────────────────────────────────────────────────────

  private _checkSecurity(actor: string, resource: string): void {
    const verdict = this._brain.analyze({
      actorId: actor,
      resource,
      action:  'key.sign',
      success: true,
      ts: Date.now(),
    });
    if (!verdict.allow) {
      this._audit.append({
        actor, actorType: 'validator', resource,
        action: 'key.sign', result: 'denied', riskScore: verdict.riskScore,
        message: `Signing denied by AI brain: ${verdict.message}`,
      });
      throw new Error(`Validator signing denied: ${verdict.message}`);
    }
  }

  private _toMeta(record: KeyRecord, layer: ValidatorLayer): ValidatorKeyMeta {
    return {
      keyId:     record.id,
      layer,
      chainId:   VALIDATOR_CHAIN_IDS[layer],
      publicKey: record.publicKey ?? '',
      createdAt: record.createdAt,
      ...(record.rotatedAt !== undefined && { rotatedAt: record.rotatedAt }),
      riskScore: record.riskScore,
      state:     record.state as ValidatorKeyMeta['state'],
    };
  }
}
