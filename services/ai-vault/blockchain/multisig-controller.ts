/**
 * GhostStack AI Vault — Multisig Controller
 * Manages m-of-n threshold signature aggregation for treasury,
 * governance proposals, and high-value bridge operations.
 *
 * Process:
 *   1. Initiator opens a signing session (pending)
 *   2. Signers submit individual signatures
 *   3. When threshold is met → session completes
 *   4. Aggregated signature is available for use
 *
 * All sessions are time-bounded and audited.
 * GhostChain L1 (14000101) | L2 (901) | L3 (903) | GST gas token
 */

import { randomHex } from '../core/crypto-engine.js';
import type { KeyManager } from '../core/key-manager.js';
import type { AuditLedger } from '../storage/audit-ledger.js';

// ── Types ──────────────────────────────────────────────────────────────────

export type MultisigSessionState = 'pending' | 'complete' | 'expired' | 'cancelled';

export type MultisigOperationType =
  | 'treasury_withdrawal'
  | 'governance_proposal'
  | 'bridge_emergency_pause'
  | 'validator_slash'
  | 'key_rotation';

export interface MultisigSession {
  id: string;
  operation: MultisigOperationType;
  messageHex: string;       // message all signers sign
  threshold: number;        // minimum signatures required
  totalSigners: number;
  signatures: MultisigSig[];
  state: MultisigSessionState;
  initiatedBy: string;
  createdAt: number;
  expiresAt: number;
  completedAt?: number;
  aggregatedSignature?: string;  // hex, available when state='complete'
  metadata?: Record<string, string>;
}

export interface MultisigSig {
  signerIndex: number;
  keyId: string;
  signature: string;    // hex
  signedAt: number;
  actor: string;
}

export interface CreateSessionOpts {
  operation: MultisigOperationType;
  messageHex: string;
  threshold: number;
  totalSigners: number;
  actor: string;
  ttlMs?: number;       // session lifetime (default 1 hour)
  metadata?: Record<string, string>;
}

// ── MultisigController ─────────────────────────────────────────────────────

export class MultisigController {
  private readonly _keyMgr: KeyManager;
  private readonly _audit:  AuditLedger;
  private readonly _sessions = new Map<string, MultisigSession>();

  private static readonly DEFAULT_TTL_MS = 3_600_000; // 1 hour

  constructor(keyMgr: KeyManager, audit: AuditLedger) {
    this._keyMgr = keyMgr;
    this._audit  = audit;
    this._startExpiryCleanup();
  }

  // ── Session Management ─────────────────────────────────────────────────────

  /**
   * Open a new multisig signing session.
   */
  createSession(opts: CreateSessionOpts): MultisigSession {
    if (opts.threshold < 1 || opts.threshold > opts.totalSigners) {
      throw new RangeError(`threshold (${opts.threshold}) must be between 1 and totalSigners (${opts.totalSigners})`);
    }

    const session: MultisigSession = {
      id:           randomHex(16),
      operation:    opts.operation,
      messageHex:   opts.messageHex,
      threshold:    opts.threshold,
      totalSigners: opts.totalSigners,
      signatures:   [],
      state:        'pending',
      initiatedBy:  opts.actor,
      createdAt:    Date.now(),
      expiresAt:    Date.now() + (opts.ttlMs ?? MultisigController.DEFAULT_TTL_MS),
      ...(opts.metadata !== undefined && { metadata: opts.metadata }),
    };

    this._sessions.set(session.id, session);

    this._audit.append({
      actor: opts.actor, actorType: 'vault',
      resource: `vault://multisig/session/${session.id}`,
      action: 'key.sign', result: 'success', riskScore: 0,
      message: `Multisig session created: ${opts.operation} (${opts.threshold}/${opts.totalSigners})`,
    });

    return { ...session };
  }

  /**
   * Submit a signature from a signer for an existing session.
   * Returns the updated session — if threshold is met, state becomes 'complete'.
   */
  async submitSignature(
    sessionId: string,
    signerIndex: number,
    keyId: string,
    actor: string,
  ): Promise<MultisigSession> {
    const session = this._getActiveSession(sessionId);

    const alreadySigned = session.signatures.some(s => s.signerIndex === signerIndex);
    if (alreadySigned) {
      throw new Error(`Signer ${signerIndex} has already signed session ${sessionId}`);
    }

    // Sign the session message
    const signResult = await this._keyMgr.sign(keyId, Buffer.from(session.messageHex, 'hex'), actor);

    const sig: MultisigSig = {
      signerIndex,
      keyId,
      signature: signResult.signature,
      signedAt:  signResult.timestamp,
      actor,
    };

    session.signatures.push(sig);

    this._audit.append({
      actor, actorType: 'vault',
      resource: `vault://multisig/session/${sessionId}`,
      action: 'key.sign', result: 'success', riskScore: 0,
      message: `Signer ${signerIndex} signed session ${sessionId} (${session.signatures.length}/${session.threshold})`,
    });

    // Check if threshold is reached
    if (session.signatures.length >= session.threshold) {
      session.state                = 'complete';
      session.completedAt          = Date.now();
      session.aggregatedSignature  = this._aggregateSignatures(session.signatures);

      this._audit.append({
        actor: 'system', actorType: 'vault',
        resource: `vault://multisig/session/${sessionId}`,
        action: 'key.sign', result: 'success', riskScore: 0,
        message: `Multisig session ${sessionId} COMPLETE (${session.signatures.length} sigs, threshold=${session.threshold})`,
      });
    }

    return { ...session };
  }

  /**
   * Cancel a pending session.
   */
  cancelSession(sessionId: string, actor: string): void {
    const session = this._sessions.get(sessionId);
    if (!session || session.state !== 'pending') {
      throw new Error(`Session ${sessionId} is not cancellable`);
    }
    session.state = 'cancelled';
    this._audit.append({
      actor, actorType: 'vault', resource: `vault://multisig/session/${sessionId}`,
      action: 'agent.action', result: 'success', riskScore: 0,
      message: `Multisig session ${sessionId} cancelled by ${actor}`,
    });
  }

  // ── Query ──────────────────────────────────────────────────────────────────

  getSession(id: string): MultisigSession | undefined {
    const s = this._sessions.get(id);
    return s ? { ...s } : undefined;
  }

  getPendingSessions(): MultisigSession[] {
    return [...this._sessions.values()]
      .filter(s => s.state === 'pending')
      .map(s => ({ ...s }));
  }

  getCompletedSessions(): MultisigSession[] {
    return [...this._sessions.values()]
      .filter(s => s.state === 'complete')
      .map(s => ({ ...s }));
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private _getActiveSession(sessionId: string): MultisigSession {
    const session = this._sessions.get(sessionId);
    if (!session) throw new Error(`Multisig session ${sessionId} not found`);
    if (session.state !== 'pending') throw new Error(`Session ${sessionId} is ${session.state}`);
    if (Date.now() > session.expiresAt) {
      session.state = 'expired';
      throw new Error(`Session ${sessionId} has expired`);
    }
    return session;
  }

  private _aggregateSignatures(sigs: MultisigSig[]): string {
    // In a production system this would use Schnorr/MuSig2 aggregation.
    // Here we concatenate sorted signatures as a deterministic representation.
    return sigs
      .slice()
      .sort((a, b) => a.signerIndex - b.signerIndex)
      .map(s => s.signature)
      .join(':');
  }

  private _startExpiryCleanup(): void {
    // Expire pending sessions every 5 minutes
    setInterval(() => {
      const now = Date.now();
      for (const [id, session] of this._sessions) {
        if (session.state === 'pending' && now > session.expiresAt) {
          session.state = 'expired';
          this._audit.append({
            actor: 'system', actorType: 'vault',
            resource: `vault://multisig/session/${id}`,
            action: 'agent.action', result: 'failure', riskScore: 0.1,
            message: `Multisig session ${id} expired (${session.signatures.length}/${session.threshold} sigs)`,
          });
        }
      }
    }, 5 * 60_000).unref();
  }
}
