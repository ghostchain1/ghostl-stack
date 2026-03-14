/**
 * GhostStack AI Vault — Treasury Key Manager
 * Protects the GhostChain sovereign treasury multisig keys.
 *
 * Treasury operations require multisig threshold approval.
 * All treasury signing is logged with chain-linked audit entries.
 * The AI brain applies stricter monitoring to treasury resources.
 *
 * GhostChain L1 (14000101) | L2 (901) | L3 (903) | GST gas token
 */

import type { KeyManager, SignResult } from '../core/key-manager.js';
import type { AuditLedger } from '../storage/audit-ledger.js';
import type { SecurityBrain } from '../ai/security-brain.js';

// ── Types ──────────────────────────────────────────────────────────────────

export type TreasuryOperation =
  | 'withdraw'
  | 'distribute_rewards'
  | 'fund_validator'
  | 'emergency_pause'
  | 'governance_proposal';

export interface TreasurySignRequest {
  keyId: string;
  operation: TreasuryOperation;
  amountGST: bigint;      // amount in GST (wei units)
  destinationAddress: string;
  messageHex: string;
  actor: string;
  signerIndex: number;    // which multisig signer is signing
}

export interface TreasurySignResult extends SignResult {
  operation: TreasuryOperation;
  amountGST: string;
  signerIndex: number;
}

export interface TreasuryKeyInfo {
  keyId: string;
  signerIndex: number;
  publicKey: string;
  createdAt: number;
  rotatedAt?: number;
  state: string;
}

// ── TreasuryKeyManager ─────────────────────────────────────────────────────

export class TreasuryKeyManager {
  private readonly _keyMgr: KeyManager;
  private readonly _audit:  AuditLedger;
  private readonly _brain:  SecurityBrain;

  // Multisig signer keys: signerIndex → keyId
  private readonly _signerKeys = new Map<number, string>();

  constructor(keyMgr: KeyManager, audit: AuditLedger, brain: SecurityBrain) {
    this._keyMgr = keyMgr;
    this._audit  = audit;
    this._brain  = brain;
  }

  // ── Key Generation ─────────────────────────────────────────────────────────

  /**
   * Generate a treasury signer key.
   * Typically called during governance setup for each multisig participant.
   */
  async generateTreasuryKey(signerIndex: number, actor = 'governance'): Promise<TreasuryKeyInfo> {
    const record = await this._keyMgr.generate({
      name:      `treasury-signer-${signerIndex}-${Date.now()}`,
      purpose:   'treasury',
      algorithm: 'ed25519',
      layer:     'l1',
      chainId:   14000101,
      actor,
      metadata: {
        signerIndex: String(signerIndex),
        component:   'treasury-key-manager',
      },
    });

    this._signerKeys.set(signerIndex, record.id);

    this._audit.append({
      actor, actorType: 'treasury-operator',
      resource: `vault://treasury/signer/${signerIndex}`,
      action: 'key.generate', result: 'success', riskScore: 0,
      message: `Treasury signer key ${signerIndex} generated`,
    });

    return {
      keyId:        record.id,
      signerIndex,
      publicKey:    record.publicKey ?? '',
      createdAt:    record.createdAt,
      ...(record.rotatedAt !== undefined && { rotatedAt: record.rotatedAt }),
      state:        record.state,
    };
  }

  // ── Signing ────────────────────────────────────────────────────────────────

  /**
   * Sign a treasury operation with a specific signer key.
   * Treasury operations are subject to the strictest AI risk controls.
   */
  async signTreasuryOperation(req: TreasurySignRequest): Promise<TreasurySignResult> {
    // Treasury operations always get full AI security screening
    this._checkTreasurySecurity(req.actor, req.operation, req.amountGST);

    const keyId = this._signerKeys.get(req.signerIndex) ?? req.keyId;
    const signResult = await this._keyMgr.sign(keyId, Buffer.from(req.messageHex, 'hex'), req.actor);

    const riskScore = req.amountGST > BigInt('1000000000000000000000') ? 0.3 : 0.1; // >1000 GST = elevated

    this._audit.append({
      actor: req.actor, actorType: 'treasury-operator',
      resource: `vault://treasury/signer/${req.signerIndex}`,
      action: 'key.sign', result: 'success', riskScore,
      message: `Treasury op signed: ${req.operation} (${req.amountGST} GST → ${req.destinationAddress})`,
      metadata: {
        operation:   req.operation,
        amountGST:   req.amountGST.toString(),
        destination: req.destinationAddress,
        signerIndex: String(req.signerIndex),
      },
    });

    return {
      ...signResult,
      operation:   req.operation,
      amountGST:   req.amountGST.toString(),
      signerIndex: req.signerIndex,
    };
  }

  // ── Rotation ───────────────────────────────────────────────────────────────

  async rotateTreasuryKey(signerIndex: number, actor = 'governance'): Promise<TreasuryKeyInfo> {
    const oldKeyId = this._signerKeys.get(signerIndex);
    if (oldKeyId) {
      await this._keyMgr.revoke(oldKeyId, actor);
    }

    const newInfo = await this.generateTreasuryKey(signerIndex, actor);

    this._brain.recordRotation(
      `vault://treasury/signer/${signerIndex}`,
      'scheduled',
      'routine',
    );

    return newInfo;
  }

  // ── Query ──────────────────────────────────────────────────────────────────

  getSignerKeyId(signerIndex: number): string | undefined {
    return this._signerKeys.get(signerIndex);
  }

  getSignerCount(): number {
    return this._signerKeys.size;
  }

  // ── Security ───────────────────────────────────────────────────────────────

  private _checkTreasurySecurity(actor: string, operation: TreasuryOperation, amountGST: bigint): void {
    const verdict = this._brain.analyze({
      actorId: actor,
      resource: 'vault://treasury/signer',
      action:  `treasury.${operation}`,
      success: true,
      ts: Date.now(),
      riskContext: {
        amountGST: amountGST.toString(),
        operation,
      },
    });

    if (!verdict.allow || verdict.riskScore > 0.7) {
      this._audit.append({
        actor, actorType: 'treasury-operator',
        resource: 'vault://treasury/signer',
        action: 'key.sign', result: 'denied',
        riskScore: verdict.riskScore,
        message: `Treasury signing denied: ${verdict.message}`,
      });
      throw new Error(`Treasury operation denied: ${verdict.message}`);
    }
  }
}
