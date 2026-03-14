/**
 * GhostStack AI Vault — SSH Key Manager
 * Manages SSH keys for infrastructure access:
 *   • Validator node access
 *   • Hypervisor host access
 *   • CI/CD deployment keys
 *   • Service-to-service SSH tunnels
 *
 * Key format: Ed25519 (preferred), RSA-4096 (legacy compat)
 * All private keys AES-256-GCM encrypted at rest in vault.
 * Public keys are safe to export and distribute.
 *
 * GhostChain L1 (14000101) | L2 (901) | L3 (903) | GST gas token
 */

import { generateKeyPairSync, randomBytes } from 'node:crypto';
import type { SecretManager } from '../core/secret-manager.js';
import type { AuditLedger } from '../storage/audit-ledger.js';
import type { SecurityBrain } from '../ai/security-brain.js';

// ── Types ──────────────────────────────────────────────────────────────────

export type SshKeyPurpose =
  | 'validator-access'
  | 'hypervisor-access'
  | 'ci-deployment'
  | 'service-tunnel'
  | 'admin-access'
  | 'backup-access';

export type SshKeyAlgorithm = 'ed25519' | 'rsa-4096';

export interface SshKeyMeta {
  id: string;
  name: string;
  purpose: SshKeyPurpose;
  algorithm: SshKeyAlgorithm;
  publicKey: string;        // OpenSSH format — safe to distribute
  vaultPath: string;        // vault path for private key
  authorizedFor: string[];  // hostnames/IPs this key can access
  createdAt: number;
  expiresAt?: number;
  rotatedAt?: number;
}

export interface GenerateSshKeyOpts {
  name: string;
  purpose: SshKeyPurpose;
  algorithm?: SshKeyAlgorithm;
  authorizedFor?: string[];
  validDays?: number;
  actor: string;
  metadata?: Record<string, string>;
}

// ── SshKeyManager ──────────────────────────────────────────────────────────

export class SshKeyManager {
  private readonly _secretMgr: SecretManager;
  private readonly _audit:     AuditLedger;
  private readonly _brain:     SecurityBrain;
  private readonly _registry   = new Map<string, SshKeyMeta>();

  constructor(secretMgr: SecretManager, audit: AuditLedger, brain: SecurityBrain) {
    this._secretMgr = secretMgr;
    this._audit     = audit;
    this._brain     = brain;
  }

  // ── Generation ─────────────────────────────────────────────────────────────

  /**
   * Generate an Ed25519 or RSA-4096 SSH key pair.
   * Private key is encrypted and stored in the vault.
   * Public key is returned and registered.
   */
  async generateSshKey(opts: GenerateSshKeyOpts): Promise<SshKeyMeta> {
    const algo      = opts.algorithm ?? 'ed25519';
    const validDays = opts.validDays ?? 30;
    const expiresAt = opts.validDays
      ? Date.now() + validDays * 86_400_000
      : undefined;

    const { privateKey, publicKey } = this._generateKeyPair(algo);

    const id        = randomBytes(8).toString('hex');
    const safeName  = opts.name.replace(/[^a-zA-Z0-9-_]/g, '-');
    const vaultPath = `vault://ssh/${opts.purpose}/${safeName}`;

    await this._secretMgr.store(vaultPath, privateKey, {
      namespace: 'ssh',
      type:      'ssh-key',
      ...(expiresAt !== undefined && { expiresAt }),
      actor:     opts.actor,
      metadata: {
        name:        opts.name,
        purpose:     opts.purpose,
        algorithm:   algo,
        publicKey,
        ...(opts.metadata ?? {}),
      },
    });

    const meta: SshKeyMeta = {
      id,
      name:          opts.name,
      purpose:       opts.purpose,
      algorithm:     algo,
      publicKey,
      vaultPath,
      authorizedFor: opts.authorizedFor ?? [],
      createdAt:     Date.now(),
      ...(expiresAt !== undefined && { expiresAt }),
    };
    this._registry.set(id, meta);

    this._audit.append({
      actor: opts.actor, actorType: 'vault',
      resource: vaultPath, action: 'key.generate', result: 'success', riskScore: 0,
      message: `SSH key generated: ${opts.name} (${algo}, purpose=${opts.purpose})`,
    });

    return meta;
  }

  // ── Retrieve ───────────────────────────────────────────────────────────────

  /**
   * Retrieve the private key for an SSH key.
   * AI security screening before every retrieval.
   */
  async getPrivateKey(id: string, actor: string): Promise<string> {
    const meta = this._registry.get(id);
    if (!meta) throw new Error(`SSH key ${id} not found`);

    this._checkSecurity(actor, meta.vaultPath);

    const result = await this._secretMgr.get(meta.vaultPath, actor, 'human');
    if (!result) throw new Error(`SSH private key not found for ${id}`);
    return result.value;
  }

  /**
   * Get the public key (safe — no AI screening needed).
   */
  getPublicKey(id: string): string {
    const meta = this._registry.get(id);
    if (!meta) throw new Error(`SSH key ${id} not found`);
    return meta.publicKey;
  }

  /**
   * Generate an authorized_keys file for a host from selected key IDs.
   */
  generateAuthorizedKeys(keyIds: string[], comment?: string): string {
    return keyIds
      .map(id => this._registry.get(id))
      .filter((m): m is SshKeyMeta => m !== undefined)
      .map(m => `${m.publicKey}${comment ? ` ${comment}:${m.name}` : ` ${m.name}`}`)
      .join('\n');
  }

  // ── Rotation ───────────────────────────────────────────────────────────────

  /**
   * Rotate an SSH key: generate a new pair and retire the old one.
   * Returns the new key meta with the updated public key.
   */
  async rotateKey(id: string, actor: string, reason = 'scheduled'): Promise<SshKeyMeta> {
    const old = this._registry.get(id);
    if (!old) throw new Error(`SSH key ${id} not found`);

    // Retire old key in vault
    await this._secretMgr.store(old.vaultPath, '__RETIRED__', { actor, actorType: 'human' });
    this._registry.delete(id);

    // Generate replacement
    const newMeta = await this.generateSshKey({
      name:          old.name,
      purpose:       old.purpose,
      algorithm:     old.algorithm,
      authorizedFor: old.authorizedFor,
      ...(old.expiresAt !== undefined && {
        validDays: Math.ceil((old.expiresAt - old.createdAt) / 86_400_000),
      }),
      actor,
    });

    this._brain.recordRotation(
      old.vaultPath,
      reason === 'scheduled' ? 'scheduled' : 'threat_detected',
      'routine',
    );

    newMeta.rotatedAt = Date.now();

    this._audit.append({
      actor, actorType: 'vault',
      resource: old.vaultPath, action: 'key.rotate', result: 'success', riskScore: 0,
      message: `SSH key rotated: ${old.name} (reason=${reason})`,
    });

    return newMeta;
  }

  // ── Query ──────────────────────────────────────────────────────────────────

  listKeys(purpose?: SshKeyPurpose): SshKeyMeta[] {
    const all = [...this._registry.values()];
    return (purpose ? all.filter(m => m.purpose === purpose) : all)
      .map(m => ({ ...m }));
  }

  getKey(id: string): SshKeyMeta | undefined {
    const m = this._registry.get(id);
    return m ? { ...m } : undefined;
  }

  getExpiringKeys(withinMs = 7 * 86_400_000): SshKeyMeta[] {
    const now = Date.now();
    return this.listKeys().filter(m => m.expiresAt !== undefined && m.expiresAt - now <= withinMs);
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private _generateKeyPair(algo: SshKeyAlgorithm): { privateKey: string; publicKey: string } {
    if (algo === 'ed25519') {
      const kp = generateKeyPairSync('ed25519', {
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        publicKeyEncoding:  { type: 'spki',  format: 'pem' },
      });
      // In production, convert PEM → OpenSSH format. Here PEM is stored.
      return { privateKey: kp.privateKey, publicKey: kp.publicKey };
    } else {
      const kp = generateKeyPairSync('rsa', {
        modulusLength: 4096,
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        publicKeyEncoding:  { type: 'spki',  format: 'pem' },
      });
      return { privateKey: kp.privateKey, publicKey: kp.publicKey };
    }
  }

  private _checkSecurity(actor: string, resource: string): void {
    const verdict = this._brain.analyze({
      actorId: actor, resource,
      action: 'secret.read', success: true, ts: Date.now(),
    });
    if (!verdict.allow) {
      throw new Error(`SSH key access denied: ${verdict.message}`);
    }
  }
}
