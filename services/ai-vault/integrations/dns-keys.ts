/**
 * GhostStack AI Vault — DNS Keys Integration
 * Manages TSIG keys for BIND9, DNSSEC signing keys, and
 * Ghost Name System (GNS) operator keys.
 *
 * Supported key types:
 *   • TSIG (HMAC-SHA256) — zone transfer authentication
 *   • DNSSEC KSK/ZSK — zone signing
 *   • GNS operator keys — Ghost Name System registration
 *   • Dynamic update keys — nsupdate authentication
 *
 * GhostChain L1 (14000101) | L2 (901) | L3 (903) | GST gas token
 */

import { randomBytes, createHmac } from 'node:crypto';
import type { SecretManager } from '../core/secret-manager.js';
import type { KeyManager } from '../core/key-manager.js';
import type { AuditLedger } from '../storage/audit-ledger.js';
import type { SecurityBrain } from '../ai/security-brain.js';

// ── Types ──────────────────────────────────────────────────────────────────

export type DnsKeyType =
  | 'tsig'
  | 'dnssec-ksk'
  | 'dnssec-zsk'
  | 'gns-operator'
  | 'dynamic-update';

export interface DnsKeyMeta {
  id: string;
  zone: string;
  keyType: DnsKeyType;
  keyName: string;       // e.g. "tsig-key.example.ghost."
  algorithm: string;     // e.g. "hmac-sha256" or "ed25519"
  vaultPath: string;
  createdAt: number;
  expiresAt?: number;
  rotatedAt?: number;
}

export interface TsigKeyConfig {
  zone: string;
  keyName: string;
  algorithm?: 'hmac-sha256' | 'hmac-sha512';
  actor: string;
}

export interface DnssecKeyConfig {
  zone: string;
  keyType: 'ksk' | 'zsk';
  actor: string;
}

export interface GnsOperatorKeyConfig {
  namespace: string;    // GNS namespace (e.g. "ghost", "validator")
  actor: string;
}

// ── DnsKeysIntegration ─────────────────────────────────────────────────────

export class DnsKeysIntegration {
  private readonly _secretMgr: SecretManager;
  private readonly _keyMgr:    KeyManager;
  private readonly _audit:     AuditLedger;
  private readonly _brain:     SecurityBrain;
  private readonly _registry   = new Map<string, DnsKeyMeta>();

  constructor(
    secretMgr: SecretManager,
    keyMgr: KeyManager,
    audit: AuditLedger,
    brain: SecurityBrain,
  ) {
    this._secretMgr = secretMgr;
    this._keyMgr    = keyMgr;
    this._audit     = audit;
    this._brain     = brain;
  }

  // ── TSIG Keys ──────────────────────────────────────────────────────────────

  /**
   * Generate a TSIG key for BIND9 zone transfer authentication.
   * Stores the base64-encoded HMAC secret in the vault.
   */
  async generateTsigKey(cfg: TsigKeyConfig): Promise<DnsKeyMeta> {
    const algo      = cfg.algorithm ?? 'hmac-sha256';
    const keySecret = randomBytes(32).toString('base64');
    const vaultPath = `vault://dns/${cfg.zone}/tsig/${cfg.keyName}`;

    await this._secretMgr.store(vaultPath, keySecret, {
      namespace: 'dns',
      type:      'dns-key',
      expiresAt: Date.now() + 30 * 86_400_000,   // 30 days
      actor:     cfg.actor,
      metadata: {
        zone:     cfg.zone,
        keyName:  cfg.keyName,
        keyType:  'tsig',
        algo,
      },
    });

    const meta: DnsKeyMeta = {
      id:        randomBytes(8).toString('hex'),
      zone:      cfg.zone,
      keyType:   'tsig',
      keyName:   cfg.keyName,
      algorithm: algo,
      vaultPath,
      createdAt: Date.now(),
      expiresAt: Date.now() + 30 * 86_400_000,
    };
    this._registry.set(vaultPath, meta);

    this._audit.append({
      actor: cfg.actor, actorType: 'vault',
      resource: vaultPath, action: 'key.generate', result: 'success', riskScore: 0,
      message: `TSIG key generated for zone ${cfg.zone} (keyName=${cfg.keyName}, algo=${algo})`,
    });

    return meta;
  }

  /**
   * Get the BIND9 key clause for a TSIG key (safe to write to named.conf).
   */
  async getTsigKeyClause(zone: string, keyName: string, actor: string): Promise<string> {
    const vaultPath = `vault://dns/${zone}/tsig/${keyName}`;
    this._checkSecurity(actor, vaultPath);

    const result = await this._secretMgr.get(vaultPath, actor, 'human');
    if (!result) throw new Error(`TSIG key not found for zone ${zone} / keyName ${keyName}`);
    const meta   = this._registry.get(vaultPath);
    const algo   = meta?.algorithm ?? 'hmac-sha256';

    return [
      `key "${keyName}" {`,
      `  algorithm ${algo};`,
      `  secret "${result.value}";`,
      `};`,
    ].join('\n');
  }

  // ── DNSSEC Keys ────────────────────────────────────────────────────────────

  /**
   * Generate a DNSSEC Key Signing Key (KSK) or Zone Signing Key (ZSK).
   * Uses Ed25519 for modern DNSSEC (RFC 8080, Algorithm 15).
   */
  async generateDnssecKey(cfg: DnssecKeyConfig): Promise<DnsKeyMeta> {
    const purpose   = cfg.keyType === 'ksk' ? 'signing' : 'signing';
    const vaultPath = `vault://dns/${cfg.zone}/dnssec/${cfg.keyType}`;

    const keyRecord = await this._keyMgr.generate({
      name:      `dnssec-${cfg.keyType}-${cfg.zone}-${Date.now()}`,
      purpose,
      algorithm: 'ed25519',
      layer:     'all',
      actor:     cfg.actor,
      expiresAt: Date.now() + 90 * 86_400_000,  // 90 days
      metadata:  { zone: cfg.zone, keyType: cfg.keyType },
    });

    const meta: DnsKeyMeta = {
      id:        keyRecord.id,
      zone:      cfg.zone,
      keyType:   cfg.keyType === 'ksk' ? 'dnssec-ksk' : 'dnssec-zsk',
      keyName:   `K${cfg.zone}+015+${Math.floor(Math.random() * 65535).toString().padStart(5, '0')}`,
      algorithm: 'ed25519',
      vaultPath,
      createdAt: Date.now(),
      ...(keyRecord.expiresAt !== undefined && { expiresAt: keyRecord.expiresAt }),
    };
    this._registry.set(vaultPath, meta);

    this._audit.append({
      actor: cfg.actor, actorType: 'vault',
      resource: vaultPath, action: 'key.generate', result: 'success', riskScore: 0,
      message: `DNSSEC ${cfg.keyType.toUpperCase()} generated for zone ${cfg.zone}`,
    });

    return meta;
  }

  // ── GNS Operator Keys ──────────────────────────────────────────────────────

  /**
   * Generate a Ghost Name System (GNS) operator key.
   * Used by GNS registrar to authenticate zone ownership.
   */
  async generateGnsOperatorKey(cfg: GnsOperatorKeyConfig): Promise<DnsKeyMeta> {
    const vaultPath = `vault://gns/${cfg.namespace}/operator-key`;

    const keyRecord = await this._keyMgr.generate({
      name:      `gns-operator-${cfg.namespace}-${Date.now()}`,
      purpose:   'signing',
      algorithm: 'ed25519',
      layer:     'l1',
      chainId:   14000101,
      actor:     cfg.actor,
      metadata:  { namespace: cfg.namespace, component: 'gns-operator' },
    });

    const meta: DnsKeyMeta = {
      id:        keyRecord.id,
      zone:      cfg.namespace + '.ghost.',
      keyType:   'gns-operator',
      keyName:   `gns-operator-${cfg.namespace}`,
      algorithm: 'ed25519',
      vaultPath,
      createdAt: Date.now(),
    };
    this._registry.set(vaultPath, meta);

    this._audit.append({
      actor: cfg.actor, actorType: 'vault',
      resource: vaultPath, action: 'key.generate', result: 'success', riskScore: 0,
      message: `GNS operator key generated for namespace ${cfg.namespace}`,
    });

    return meta;
  }

  // ── Rotation ───────────────────────────────────────────────────────────────

  async rotateTsigKey(zone: string, keyName: string, actor: string): Promise<DnsKeyMeta> {
    const vaultPath = `vault://dns/${zone}/tsig/${keyName}`;
    const meta      = this._registry.get(vaultPath);
    if (!meta) throw new Error(`TSIG key not found: ${vaultPath}`);

    const newSecret = randomBytes(32).toString('base64');
    await this._secretMgr.store(vaultPath, newSecret, { actor, actorType: 'human' });

    meta.rotatedAt = Date.now();
    this._brain.recordRotation(vaultPath, 'scheduled', 'routine');

    this._audit.append({
      actor, actorType: 'vault',
      resource: vaultPath, action: 'key.rotate', result: 'success', riskScore: 0,
      message: `TSIG key rotated for zone ${zone}`,
    });

    return meta;
  }

  // ── Query ──────────────────────────────────────────────────────────────────

  listKeys(zone?: string): DnsKeyMeta[] {
    const all = [...this._registry.values()];
    return zone ? all.filter(k => k.zone === zone) : all;
  }

  getKey(vaultPath: string): DnsKeyMeta | undefined {
    return this._registry.get(vaultPath);
  }

  // ── Security ───────────────────────────────────────────────────────────────

  private _checkSecurity(actor: string, resource: string): void {
    const verdict = this._brain.analyze({
      actorId: actor, resource,
      action: 'secret.read', success: true, ts: Date.now(),
    });
    if (!verdict.allow) {
      throw new Error(`DNS key access denied: ${verdict.message}`);
    }
  }
}
