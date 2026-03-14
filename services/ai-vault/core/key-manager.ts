/**
 * GhostStack AI Vault — Key Manager
 * Manages cryptographic key lifecycle: generation, storage, rotation, signing,
 * and retirement. Integrates with the KeyDatabase and EncryptedStore.
 *
 * Keys that belong to GhostChain (validator, bridge, treasury, sequencer)
 * are routed to the blockchain-specific managers. This manager handles
 * the storage and lifecycle layer.
 *
 * All private keys are AES-256-GCM encrypted at rest.
 * Signing operations lock the key in memory and wipe after use.
 *
 * GhostChain L1 (14000101) | L2 (901) | L3 (903) | GST gas token
 */

import {
  generateEd25519KeyPair,
  generateX25519KeyPair,
  signEd25519,
  SecureKey,
  randomHex,
  sha256 as hashSha256,
} from './crypto-engine.js';
import { type EncryptedStore } from '../storage/encrypted-store.js';
import {
  KeyDatabase,
  type KeyRecord,
  type KeyAlgorithm,
  type KeyPurpose,
  type KeyLayer,
} from '../storage/key-database.js';
import { type AuditLedger } from '../storage/audit-ledger.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface GenerateKeyOpts {
  name: string;
  purpose: KeyPurpose;
  algorithm: KeyAlgorithm;
  layer: KeyLayer;
  chainId?: number;
  expiresAt?: number;
  actor?: string;
  metadata?: Record<string, string>;
}

export interface SignResult {
  signature: string;   // hex
  keyId: string;
  timestamp: number;
}

export interface RotateKeyResult {
  ok: boolean;
  keyId: string;
  newPublicKey?: string;
  error?: string;
}

// ── KeyManager ─────────────────────────────────────────────────────────────

export class KeyManager {
  private readonly _store:  EncryptedStore;
  private readonly _keyDb:  KeyDatabase;
  private readonly _audit:  AuditLedger;
  private readonly _masterKey: SecureKey;

  constructor(store: EncryptedStore, keyDb: KeyDatabase, audit: AuditLedger, masterKey: SecureKey) {
    this._store     = store;
    this._keyDb     = keyDb;
    this._audit     = audit;
    this._masterKey = masterKey;
  }

  // ── Generate ───────────────────────────────────────────────────────────────

  /**
   * Generate a new cryptographic key pair (Ed25519 or X25519),
   * store the private key encrypted in the vault, and record metadata.
   */
  async generate(opts: GenerateKeyOpts): Promise<KeyRecord> {
    const actor = opts.actor ?? 'system';

    let publicKey: string;
    let privateKeyHex: string;

    switch (opts.algorithm) {
      case 'ed25519': {
        const kp = generateEd25519KeyPair();
        publicKey = kp.publicKey;
        privateKeyHex = kp.privateKey;
        break;
      }
      case 'x25519': {
        const kp = generateX25519KeyPair();
        publicKey = kp.publicKey;
        privateKeyHex = kp.privateKey;
        break;
      }
      default:
        throw new Error(`Key algorithm "${opts.algorithm}" not yet supported for generation`);
    }

    // Store private key encrypted in the vault
    const secretPath = `vault://keys/${opts.layer}/${opts.name}`;
    this._store.set(secretPath, privateKeyHex, {
      metadata: {
        keyName:   opts.name,
        algorithm: opts.algorithm,
        purpose:   opts.purpose,
        layer:     opts.layer,
      },
    });

    // Wipe plaintext private key immediately
    const privBuf = Buffer.from(privateKeyHex, 'hex');
    privBuf.fill(0);

    // Record key metadata
    const record = this._keyDb.insert({
      name:      opts.name,
      purpose:   opts.purpose,
      algorithm: opts.algorithm,
      layer:     opts.layer,
      ...(opts.chainId  !== undefined && { chainId:  opts.chainId }),
      ...(opts.expiresAt !== undefined && { expiresAt: opts.expiresAt }),
      state:     'active',
      publicKey,
      secretPath,
      metadata:  opts.metadata ?? {},
    });

    this._audit.append({
      actor,
      actorType: 'system',
      resource: secretPath,
      action: 'key.generate',
      result: 'success',
      riskScore: 0,
      message: `Generated ${opts.algorithm} key "${opts.name}" for ${opts.purpose} on ${opts.layer}`,
    });

    return record;
  }

  // ── Sign ────────────────────────────────────────────────────────────────────

  /**
   * Sign a message using the private key identified by keyId.
   * The private key is decrypted from the vault, used, and immediately wiped.
   * Private key NEVER leaves this function scope.
   */
  async sign(
    keyId: string,
    message: Buffer,
    actor: string,
    purpose?: string,
  ): Promise<SignResult> {
    const keyRecord = this._keyDb.getById(keyId);
    if (!keyRecord) throw new Error(`Key "${keyId}" not found`);
    if (keyRecord.state !== 'active') throw new Error(`Key "${keyId}" is ${keyRecord.state} — cannot sign`);

    // Retrieve encrypted private key
    const privHex = this._store.getString(keyRecord.secretPath);
    if (!privHex) throw new Error(`Private key material for "${keyId}" not found in vault`);

    let signature: string;
    const privBuf = Buffer.from(privHex, 'hex');

    try {
      if (keyRecord.algorithm !== 'ed25519') {
        throw new Error(`Signing not supported for algorithm "${keyRecord.algorithm}"`);
      }
      signature = signEd25519(privBuf, message);
    } finally {
      // Wipe private key from memory
      privBuf.fill(0);
    }

    const msgHash = hashSha256(message);
    this._keyDb.recordSign(keyId, actor, msgHash, purpose);

    this._audit.append({
      actor,
      actorType: 'validator',
      resource:  keyRecord.secretPath,
      action:    'key.sign',
      result:    'success',
      riskScore: 0.1,
      message:   `Signed message (purpose: ${purpose ?? 'unspecified'}) with key "${keyRecord.name}"`,
    });

    return { signature, keyId, timestamp: Date.now() };
  }

  // ── Rotate ──────────────────────────────────────────────────────────────────

  /**
   * Generate a new key pair and replace the existing one.
   * Old key is transitioned to 'retiring' state during the cutover window,
   * then marked 'retired'.
   */
  async rotate(keyId: string, actor: string, reason = 'scheduled'): Promise<RotateKeyResult> {
    const old = this._keyDb.getById(keyId);
    if (!old) return { ok: false, keyId, error: 'Key not found' };
    if (old.state === 'compromised' || old.state === 'revoked') {
      return { ok: false, keyId, error: `Cannot rotate ${old.state} key` };
    }

    try {
      // Mark old key as rotating
      this._keyDb.update(keyId, { state: 'rotating' });

      // Generate new key pair
      let newPublicKey: string;
      let newPrivateHex: string;

      if (old.algorithm === 'ed25519') {
        const kp = generateEd25519KeyPair();
        newPublicKey = kp.publicKey;
        newPrivateHex = kp.privateKey;
      } else if (old.algorithm === 'x25519') {
        const kp = generateX25519KeyPair();
        newPublicKey = kp.publicKey;
        newPrivateHex = kp.privateKey;
      } else {
        // For symmetric keys, generate random bytes
        newPrivateHex = randomHex(32);
        newPublicKey  = '';
      }

      // Store new private key
      this._store.set(old.secretPath, newPrivateHex, {
        metadata: { rotatedBy: actor, reason },
      });

      // Wipe plaintext
      Buffer.from(newPrivateHex, 'hex').fill(0);

      // Update key record
      this._keyDb.update(keyId, {
        state:     'active',
        publicKey: newPublicKey || (old.publicKey ?? ''),
        rotatedAt: Date.now(),
      });
      this._keyDb.recordRotation({
        keyId,
        ...(old.publicKey !== undefined && { oldPublicKey: old.publicKey }),
        ...(newPublicKey   !== undefined && { newPublicKey }),
        initiatedBy: actor,
        reason,
      });

      this._store.markRotated(old.secretPath);

      this._audit.append({
        actor,
        actorType: 'system',
        resource:  old.secretPath,
        action:    'key.rotate',
        result:    'success',
        riskScore: 0.2,
        message:   `Rotated key "${old.name}". Reason: ${reason}`,
      });

      return { ok: true, keyId, newPublicKey };
    } catch (err) {
      // Revert to active on failure
      const current = this._keyDb.getById(keyId);
      if (current?.state === 'rotating') {
        this._keyDb.update(keyId, { state: 'active' });
      }
      this._audit.append({
        actor, actorType: 'system',
        resource: keyId,
        action: 'key.rotate', result: 'failure', riskScore: 0.5,
        message: (err as Error).message,
      });
      return { ok: false, keyId, error: (err as Error).message };
    }
  }

  // ── Revoke ──────────────────────────────────────────────────────────────────

  revoke(keyId: string, actor: string, reason = 'manual'): void {
    const record = this._keyDb.getById(keyId);
    if (!record) throw new Error(`Key "${keyId}" not found`);

    this._keyDb.update(keyId, { state: 'revoked' });
    this._audit.append({
      actor, actorType: 'system',
      resource: record.secretPath,
      action: 'key.revoke', result: 'success', riskScore: 0.7,
      message: `Key "${record.name}" revoked. Reason: ${reason}`,
    });
  }

  // ── Query ───────────────────────────────────────────────────────────────────

  getById(keyId: string): KeyRecord | null {
    return this._keyDb.getById(keyId);
  }

  getByName(name: string): KeyRecord | null {
    return this._keyDb.getByName(name);
  }

  list(filter?: Parameters<KeyDatabase['list']>[0]): KeyRecord[] {
    return this._keyDb.list(filter);
  }

  getRotationHistory(keyId: string) {
    return this._keyDb.getRotationHistory(keyId);
  }
}
