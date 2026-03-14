/**
 * GhostStack AI Vault — GhostBrain Connector
 *
 * Secure communication bridge between GhostBrain Core (port 7900) and the
 * AI Vault.  The connector:
 *   - Authenticates GhostBrain as a registered AI agent
 *   - Provides a typed async API for GhostBrain to read secrets and keys
 *   - Routes complex commands through AiCommandGateway
 *   - Subscribes to VaultEvents and forwards security signals to GhostBrain
 *   - Enforces rate-limiting on GhostBrain requests (prevent abuse/runaway AI)
 *
 * This is the ONLY path through which GhostBrain may access vault material.
 * All other access is rejected at the policy layer.
 *
 * GhostChain L1 (14000101) | L2 (901) | L3 (903) | GST gas token
 */

import { EventEmitter }       from 'node:events';
import { SecretManager }      from '../core/secret-manager.js';
import { KeyManager }         from '../core/key-manager.js';
import { AuditLedger }        from '../storage/audit-ledger.js';
import { VaultEvents }        from '../core/vault-events.js';
import { AiCommandGateway, type VaultCommand, type CommandResult } from './ai-command-gateway.js';
import { AiMemoryVault, type MemoryCategory }     from './ai-memory-vault.js';
import { verifyAgentToken, authorizeAgentAction } from './ai-auth.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface BrainConnectorOpts {
  /** Rate limit — max requests per 60 s window per agent */
  maxRequestsPerMinute?: number;
}

export interface SecretRequest {
  vaultPath:   string;
  agentToken:  string;
}

export interface KeySignRequest {
  keyId:       string;
  messageHex:  string;
  purpose?:    string;
  agentToken:  string;
}

export interface BrainEvent {
  event:    string;
  payload:  unknown;
  ts:       number;
}

// ── Rate Limiter ───────────────────────────────────────────────────────────

class RateLimiter {
  private _counts = new Map<string, { count: number; resetAt: number }>();

  check(agentId: string, max: number): boolean {
    const now  = Date.now();
    const slot = this._counts.get(agentId);
    if (!slot || now > slot.resetAt) {
      this._counts.set(agentId, { count: 1, resetAt: now + 60_000 });
      return true;
    }
    if (slot.count >= max) return false;
    slot.count++;
    return true;
  }
}

// ── BrainConnector ─────────────────────────────────────────────────────────

export class BrainConnector extends EventEmitter {

  private readonly _gateway:  AiCommandGateway;
  private readonly _memory:   AiMemoryVault;
  private readonly _limiter:  RateLimiter;
  private readonly _maxRpm:   number;

  constructor(
    private readonly _secrets: SecretManager,
    private readonly _keys:    KeyManager,
    private readonly _audit:   AuditLedger,
    private readonly _events:  typeof VaultEvents,
    opts: BrainConnectorOpts = {},
  ) {
    super();
    this._maxRpm  = opts.maxRequestsPerMinute ?? 120;
    this._limiter = new RateLimiter();
    this._gateway = new AiCommandGateway(_secrets, _keys, _audit, _events);
    this._memory  = new AiMemoryVault(_secrets, _audit);

    // Forward vault events to GhostBrain subscribers
    this._bridgeVaultEvents();
  }

  // ── Secret Access ─────────────────────────────────────────────────────────

  /**
   * Request a secret value from the vault.  GhostBrain must supply a valid
   * short-lived JWT and the secret must be within the agent's allowed paths.
   */
  async requestSecret(req: SecretRequest): Promise<string | null> {
    const auth = await verifyAgentToken(req.agentToken);
    if (!auth.ok || !auth.agentId) {
      throw new Error(`GhostBrain auth failed: ${auth.error}`);
    }

    if (!this._limiter.check(auth.agentId, this._maxRpm)) {
      throw new Error(`Rate limit exceeded for agent '${auth.agentId}'`);
    }

    if (!authorizeAgentAction(auth, req.vaultPath, 'secret.read')) {
      this._audit.append({
        action:    'secret.read',
        actor:     auth.agentId,
        actorType: 'ghostbrain',
        resource:  req.vaultPath,
        result:    'denied',
        riskScore: 0.5,
        metadata:  { via: 'brain-connector' },
      });
      throw new Error(`Agent '${auth.agentId}' not allowed to read ${req.vaultPath}`);
    }

    const val = await this._secrets.get(req.vaultPath, auth.agentId, 'ghostbrain');

    this._audit.append({
      action:    'secret.read',
      actor:     auth.agentId,
      actorType: 'ghostbrain',
      resource:  req.vaultPath,
      result:    val ? 'success' : 'denied',
      riskScore: 0,
      metadata:  { via: 'brain-connector' },
    });

    return val?.value ?? null;
  }

  /**
   * Rotate a secret.  GhostBrain specifies the path; the vault generates
   * the new value automatically.
   */
  async rotateSecret(req: SecretRequest & { reason?: string }): Promise<boolean> {
    const result = await this._execCommand({
      type:       'ROTATE_SECRET',
      agentToken: req.agentToken,
      issuedAt:   new Date().toISOString(),
      commandId:  `brain-rotate-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      vaultPath:  req.vaultPath,
      ...(req.reason !== undefined && { reason: req.reason }),
    });
    return result.ok;
  }

  /**
   * Sign a message with a managed key.
   */
  async signWithKey(req: KeySignRequest): Promise<string | null> {
    const result = await this._execCommand({
      type:        'SIGN_MESSAGE',
      agentToken:  req.agentToken,
      issuedAt:    new Date().toISOString(),
      commandId:   `brain-sign-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      keyId:       req.keyId,
      messageHex:  req.messageHex,
      ...(req.purpose !== undefined && { purpose: req.purpose }),
    });
    if (!result.ok) return null;
    return (result.data as { signatureHex: string }).signatureHex;
  }

  // ── Command Dispatch ──────────────────────────────────────────────────────

  /**
   * Execute a structured command through the AI Command Gateway.
   * This is the primary interface for complex GhostBrain actions.
   */
  async executeCommand(cmd: VaultCommand): Promise<CommandResult> {
    return this._execCommand(cmd);
  }

  private async _execCommand(cmd: VaultCommand): Promise<CommandResult> {
    const auth = await verifyAgentToken(cmd.agentToken);
    if (!auth.ok || !auth.agentId) {
      return {
        ok: false, commandId: cmd.commandId, commandType: cmd.type,
        agentId: 'unknown', executedAt: Date.now(),
        error: auth.error ?? 'Authentication failed',
      };
    }

    if (!this._limiter.check(auth.agentId, this._maxRpm)) {
      return {
        ok: false, commandId: cmd.commandId, commandType: cmd.type,
        agentId: auth.agentId, executedAt: Date.now(),
        error: 'Rate limit exceeded',
      };
    }

    return this._gateway.execute(cmd);
  }

  // ── AI Memory ─────────────────────────────────────────────────────────────

  /**
   * Store a memory entry on behalf of a GhostBrain agent.
   */
  async storeMemory<T>(
    agentId:  string,
    category: MemoryCategory,
    key:      string,
    data:     T,
    ttlSecs?: number,
  ): Promise<void> {
    await this._memory.store(agentId, category, key, data, {
      ...(ttlSecs !== undefined && { ttlSecs }),
      actorId: agentId,
    });
  }

  /**
   * Retrieve a memory entry for a GhostBrain agent.
   */
  async retrieveMemory<T = unknown>(
    agentId:  string,
    category: MemoryCategory,
    key:      string,
  ): Promise<T | null> {
    return this._memory.retrieve<T>(agentId, category, key, { actorId: agentId });
  }

  /**
   * Checkpoint an agent's operational state.
   */
  async checkpoint(agentId: string, state: Record<string, unknown>): Promise<void> {
    await this._memory.checkpoint(agentId, state);
  }

  /**
   * Restore the most recent checkpoint for an agent.
   */
  async restoreCheckpoint(agentId: string): Promise<Record<string, unknown> | null> {
    return this._memory.restoreCheckpoint(agentId);
  }

  // ── Event Bridge ──────────────────────────────────────────────────────────

  /**
   * Subscribe to vault events as GhostBrain.  Returns an unsubscribe function.
   */
  subscribeToVaultEvents(
    handler: (event: BrainEvent) => void,
  ): () => void {
    const listener = (event: BrainEvent) => handler(event);
    this.on('vault-event', listener);
    return () => this.off('vault-event', listener);
  }

  private _bridgeVaultEvents(): void {
    const fwd = (event: string) => (payload: unknown) => {
      this.emit('vault-event', { event, payload, ts: Date.now() } satisfies BrainEvent);
    };

    this._events.on('secret.rotated',    fwd('secret.rotated'));
    this._events.on('security.alert',    fwd('security.alert'));
    this._events.on('threat.detected',   fwd('threat.detected'));
    this._events.on('key.rotated',       fwd('key.rotated'));
    this._events.on('compliance.report', fwd('compliance.report'));
    this._events.on('anomaly.detected',  fwd('anomaly.detected'));
    this._events.on('actor.blocked',     fwd('actor.blocked'));
  }
}
