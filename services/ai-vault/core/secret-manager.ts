/**
 * GhostStack AI Vault — Secret Manager
 * High-level CRUD for secrets with encryption, expiry, rotation, and classification.
 *
 * Secret paths follow the format: vault://<namespace>/<subpath>
 * Examples:
 *   vault://docker/postgres/password
 *   vault://api/ghostbrain/token
 *   vault://github/actions/deploy-key
 *   vault://dns/bind9/tsig-key
 *
 * GhostChain L1 (14000101) | L2 (901) | L3 (903) | GST gas token
 */

import { randomBytes } from 'node:crypto';
import { type SecretMeta, EncryptedStore } from '../storage/encrypted-store.js';
import { type AuditLedger } from '../storage/audit-ledger.js';
import { type PolicyEngine } from './policy-engine.js';
import { randomHex, randomBase64 } from './crypto-engine.js';

// ── Types ──────────────────────────────────────────────────────────────────

export type SecretType =
  | 'api-token'
  | 'db-password'
  | 'jwt-secret'
  | 'ssh-key'
  | 'ssl-cert'
  | 'dns-key'
  | 'oauth-token'
  | 'webhook-secret'
  | 'generic';

export interface StoreSecretOpts {
  namespace?: string;
  type?: SecretType;
  expiresAt?: number;
  metadata?: Record<string, string>;
  actor?: string;
  actorType?: string;
}

export interface RotateResult {
  ok: boolean;
  path: string;
  newVersion?: number;
  error?: string;
}

export interface SecretValue {
  meta: SecretMeta;
  value: string;  // UTF-8 decoded secret value
}

// ── Secret Manager ─────────────────────────────────────────────────────────

export class SecretManager {
  private readonly _store:  EncryptedStore;
  private readonly _audit:  AuditLedger;
  private readonly _policy: PolicyEngine;

  constructor(store: EncryptedStore, audit: AuditLedger, policy: PolicyEngine) {
    this._store  = store;
    this._audit  = audit;
    this._policy = policy;
  }

  // ── Store ──────────────────────────────────────────────────────────────────

  /**
   * Store a secret value at the given vault:// path.
   * If the path already exists, a new version is created.
   */
  async store(path: string, value: string, opts: StoreSecretOpts = {}): Promise<SecretMeta> {
    this._validatePath(path);

    const meta = this._store.set(path, value, {
      ...(opts.namespace !== undefined && { namespace: opts.namespace }),
      ...(opts.expiresAt !== undefined && { expiresAt: opts.expiresAt }),
      metadata: {
        type:       opts.type ?? 'generic',
        ...(opts.metadata ?? {}),
      },
    });

    this._audit.append({
      actor:     opts.actor ?? 'system',
      actorType: opts.actorType ?? 'system',
      resource:  path,
      action:    'secret.write',
      result:    'success',
      riskScore: 0,
      message:   `Stored secret v${meta.version}`,
    });

    return meta;
  }

  // ── Read ───────────────────────────────────────────────────────────────────

  /**
   * Retrieve a secret value. Returns null if not found or expired.
   */
  async get(path: string, actor: string, actorType = 'unknown'): Promise<SecretValue | null> {
    this._validatePath(path);
    const value = this._store.getString(path);

    if (value === null) {
      this._audit.append({
        actor, actorType, resource: path,
        action: 'secret.read', result: 'failure', riskScore: 0.1,
        message: 'Not found or expired',
      });
      return null;
    }

    const meta = this._store.getMeta(path)!;
    this._audit.append({
      actor, actorType, resource: path,
      action: 'secret.read', result: 'success', riskScore: 0,
      message: `Retrieved secret v${meta.version}`,
    });

    return { meta, value };
  }

  /**
   * Get secret metadata without decrypting the value.
   */
  getMeta(path: string): SecretMeta | null {
    return this._store.getMeta(path);
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  async delete(path: string, actor: string, actorType = 'unknown'): Promise<boolean> {
    this._validatePath(path);
    const ok = this._store.delete(path);
    this._audit.append({
      actor, actorType, resource: path,
      action: 'secret.delete', result: ok ? 'success' : 'failure', riskScore: 0.2,
    });
    return ok;
  }

  // ── List ───────────────────────────────────────────────────────────────────

  list(prefix = ''): SecretMeta[] {
    return this._store.list(prefix);
  }

  // ── Rotation ───────────────────────────────────────────────────────────────

  /**
   * Generate and store a new random value at the given path.
   * Use for API tokens, JWT secrets, passwords, etc.
   */
  async rotate(
    path: string,
    opts: {
      lengthBytes?: number;
      encoding?: 'hex' | 'base64';
      actor?: string;
      actorType?: string;
      reason?: string;
    } = {},
  ): Promise<RotateResult> {
    this._validatePath(path);
    const len    = opts.lengthBytes ?? 32;
    const newVal = opts.encoding === 'hex' ? randomHex(len) : randomBase64(len);

    try {
      const existingMeta = this._store.getMeta(path);
      const meta = this._store.set(path, newVal, {
        metadata: { rotationReason: opts.reason ?? 'scheduled' },
      });
      this._store.markRotated(path);

      this._audit.append({
        actor:     opts.actor ?? 'system',
        actorType: opts.actorType ?? 'system',
        resource:  path,
        action:    'secret.rotate',
        result:    'success',
        riskScore: 0,
        message:   `Rotated from v${existingMeta?.version ?? 0} to v${meta.version}. Reason: ${opts.reason ?? 'scheduled'}`,
      });

      return { ok: true, path, newVersion: meta.version };
    } catch (err) {
      this._audit.append({
        actor:     opts.actor ?? 'system',
        actorType: opts.actorType ?? 'system',
        resource:  path,
        action:    'secret.rotate',
        result:    'failure',
        riskScore: 0.4,
        message:   (err as Error).message,
      });
      return { ok: false, path, error: (err as Error).message };
    }
  }

  // ── Generation ─────────────────────────────────────────────────────────────

  /**
   * Generate and immediately store a new secret.
   * @returns { path, value } — value is plaintext; store it securely.
   */
  async generate(
    path: string,
    opts: {
      type?: SecretType;
      lengthBytes?: number;
      encoding?: 'hex' | 'base64';
      expiresAt?: number;
      actor?: string;
      actorType?: string;
    } = {},
  ): Promise<{ path: string; value: string; meta: SecretMeta }> {
    const len    = opts.lengthBytes ?? 32;
    const value  = opts.encoding === 'hex' ? randomHex(len) : randomBase64(len);
    const meta   = await this.store(path, value, {
      ...(opts.type      !== undefined && { type:      opts.type }),
      ...(opts.expiresAt !== undefined && { expiresAt: opts.expiresAt }),
      ...(opts.actor     !== undefined && { actor:     opts.actor }),
      ...(opts.actorType !== undefined && { actorType: opts.actorType }),
    });
    return { path, value, meta };
  }

  // ── Expiry Maintenance ────────────────────────────────────────────────────

  pruneExpired(): number {
    const count = this._store.pruneExpired();
    if (count > 0) {
      this._audit.append({
        actor: 'system', actorType: 'system',
        resource: 'vault://system/prune',
        action: 'secret.expire', result: 'success', riskScore: 0,
        message: `Pruned ${count} expired secrets`,
      });
    }
    return count;
  }

  // ── Validation ────────────────────────────────────────────────────────────

  private _validatePath(path: string): void {
    // Must start with vault://
    if (!path.startsWith('vault://')) {
      throw new Error(`Invalid secret path "${path}": must start with vault://`);
    }
    // Prevent path traversal
    if (path.includes('..') || path.includes('\0')) {
      throw new Error(`Invalid secret path "${path}": contains dangerous characters`);
    }
    // Max length
    if (path.length > 512) {
      throw new Error(`Secret path exceeds maximum length (512 chars)`);
    }
  }
}
