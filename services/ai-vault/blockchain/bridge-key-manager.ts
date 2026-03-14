/**
 * GhostStack AI Vault — Bridge Key Manager
 * Manages signer keys for the GhostStack cross-chain bridge infrastructure.
 *
 * Bridge topology:
 *   GhostL3 (903) → [L2L3Bridge] → GhostL2 (901) → [L1 Rollup] → GhostChain L1 (14000101)
 *
 * Canonical bridge addresses (from governance):
 *   L2L3Bridge:         0xDadd1125B8Df98A66Abd5EB302C0d9Ca5A061dC2
 *   L1 Rollup (L2):     0xad32D5C2Da9f4159C4cc98686C005852b3905355
 *   L2 Rollup (L3):     0x130A46b6E41DB6E1e18fb9c759F223c459190e90
 *   Finality Oracle L1: 0x7B3Be2dDDdDf9A0a3fE1DC57B98980F662C3a422
 *   Finality Oracle L2: 0x650aEF4b63095e4EDe581BC79CdeA927e3ba553A
 *   Finality Oracle L3: 0x87F850cbC2cFfac086F20d0d7307E12d06fA2127
 *
 * GhostChain L1 (14000101) | L2 (901) | L3 (903) | GST gas token
 */

import type { KeyManager, SignResult } from '../core/key-manager.js';
import type { AuditLedger } from '../storage/audit-ledger.js';
import type { SecurityBrain } from '../ai/security-brain.js';

// ── Types ──────────────────────────────────────────────────────────────────

export type BridgeLeg = 'l1-l2' | 'l2-l3' | 'finality-oracle-l1' | 'finality-oracle-l2' | 'finality-oracle-l3';

export const BRIDGE_CONTRACTS: Record<BridgeLeg, string> = {
  'l1-l2':              '0xad32D5C2Da9f4159C4cc98686C005852b3905355',
  'l2-l3':              '0x130A46b6E41DB6E1e18fb9c759F223c459190e90',
  'finality-oracle-l1': '0x7B3Be2dDDdDf9A0a3fE1DC57B98980F662C3a422',
  'finality-oracle-l2': '0x650aEF4b63095e4EDe581BC79CdeA927e3ba553A',
  'finality-oracle-l3': '0x87F850cbC2cFfac086F20d0d7307E12d06fA2127',
};

export interface BridgeSignRequest {
  leg: BridgeLeg;
  transferId: string;
  messageHex: string;
  actor: string;
}

export interface BridgeSignResult extends SignResult {
  leg: BridgeLeg;
  contract: string;
  transferId: string;
}

// ── BridgeKeyManager ───────────────────────────────────────────────────────

export class BridgeKeyManager {
  private readonly _keyMgr: KeyManager;
  private readonly _audit:  AuditLedger;
  private readonly _brain:  SecurityBrain;

  // Active signer key per bridge leg
  private readonly _activeKeys = new Map<BridgeLeg, string>();

  constructor(keyMgr: KeyManager, audit: AuditLedger, brain: SecurityBrain) {
    this._keyMgr = keyMgr;
    this._audit  = audit;
    this._brain  = brain;
  }

  // ── Generate ───────────────────────────────────────────────────────────────

  async generateBridgeKey(leg: BridgeLeg, actor = 'system'): Promise<string> {
    const record = await this._keyMgr.generate({
      name:      `bridge-${leg}-${Date.now()}`,
      purpose:   'bridge',
      algorithm: 'ed25519',
      layer:     this._legToLayer(leg),
      actor,
      metadata: {
        leg,
        contract: BRIDGE_CONTRACTS[leg] ?? '',
      },
    });

    this._activeKeys.set(leg, record.id);

    this._audit.append({
      actor, actorType: 'vault', resource: `vault://bridge/${leg}/key`,
      action: 'key.generate', result: 'success', riskScore: 0,
      message: `Bridge signer key generated for leg=${leg}`,
    });

    return record.id;
  }

  // ── Signing ────────────────────────────────────────────────────────────────

  /**
   * Sign a bridge transfer message. AI security screening before every sign.
   */
  async signBridgeTransfer(req: BridgeSignRequest): Promise<BridgeSignResult> {
    this._checkSecurity(req.actor, `vault://bridge/${req.leg}/key`);

    const keyId = this._activeKeys.get(req.leg);
    if (!keyId) throw new Error(`No active bridge key for leg ${req.leg}`);

    const signResult = await this._keyMgr.sign(keyId, Buffer.from(req.messageHex, 'hex'), req.actor);

    this._audit.append({
      actor: req.actor, actorType: 'bridge-operator',
      resource: `vault://bridge/${req.leg}/key/${keyId}`,
      action: 'key.sign', result: 'success', riskScore: 0,
      message: `Bridge transfer signed (leg=${req.leg}, transferId=${req.transferId})`,
    });

    return {
      ...signResult,
      leg:        req.leg,
      contract:   BRIDGE_CONTRACTS[req.leg] ?? '',
      transferId: req.transferId,
    };
  }

  // ── Rotation ───────────────────────────────────────────────────────────────

  async rotateBridgeKey(leg: BridgeLeg, actor = 'system', reason = 'scheduled'): Promise<string> {
    const oldKeyId = this._activeKeys.get(leg);
    if (oldKeyId) {
      await this._keyMgr.revoke(oldKeyId, actor);
    }

    const newKeyId = await this.generateBridgeKey(leg, actor);

    this._brain.recordRotation(
      `vault://bridge/${leg}/key`,
      reason === 'scheduled' ? 'scheduled' : 'threat_detected',
      'urgent',
    );

    this._audit.append({
      actor, actorType: 'vault', resource: `vault://bridge/${leg}/key`,
      action: 'key.rotate', result: 'success', riskScore: 0,
      message: `Bridge key rotated (leg=${leg}, reason=${reason})`,
    });

    return newKeyId;
  }

  // ── Query ──────────────────────────────────────────────────────────────────

  getActiveKeyId(leg: BridgeLeg): string | undefined {
    return this._activeKeys.get(leg);
  }

  getAllLegs(): BridgeLeg[] {
    return Object.keys(BRIDGE_CONTRACTS) as BridgeLeg[];
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private _legToLayer(leg: BridgeLeg): 'l1' | 'l2' | 'l3' {
    if (leg.startsWith('l1') || leg === 'finality-oracle-l1') return 'l1';
    if (leg.startsWith('l2') || leg === 'finality-oracle-l2') return 'l2';
    return 'l3';
  }

  private _checkSecurity(actor: string, resource: string): void {
    const verdict = this._brain.analyze({
      actorId: actor, resource,
      action: 'key.sign', success: true, ts: Date.now(),
    });
    if (!verdict.allow) {
      throw new Error(`Bridge signing denied by AI: ${verdict.message}`);
    }
  }
}
