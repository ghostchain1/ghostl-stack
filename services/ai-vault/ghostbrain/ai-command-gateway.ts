/**
 * GhostStack AI Vault — AI Command Gateway
 *
 * The gateway processes commands issued by GhostBrain Core and other
 * registered AI agents.  Every command:
 *   1. Is authenticated via the ai-auth layer (JWT verification)
 *   2. Is authorized against the agent's capability scope
 *   3. Emits a vault event for subscribers
 *   4. Is recorded in the tamper-evident audit ledger
 *
 * Supported commands:
 *   ROTATE_SECRET   — Rotate a secret at the given vault path
 *   REVOKE_ACCESS   — Revoke a JWT token or actor
 *   GENERATE_KEY    — Generate a new cryptographic key
 *   LOCK_CONTAINER  — Signal container lockdown via VaultEvents
 *   READ_SECRET     — Read a secret (constrained to agent scope)
 *   SIGN_MESSAGE    — Sign data with a managed key
 *
 * GhostChain L1 (14000101) | L2 (901) | L3 (903) | GST gas token
 */

import { SecretManager }   from '../core/secret-manager.js';
import { KeyManager }       from '../core/key-manager.js';
import { AuditLedger }      from '../storage/audit-ledger.js';
import { VaultEvents }      from '../core/vault-events.js';
import { revokeActor, revokeToken } from '../core/identity-engine.js';
import type { KeyAlgorithm, KeyLayer } from '../storage/key-database.js';
import {
  verifyAgentToken,
  authorizeAgentAction,
  type AiAuthResult,
} from './ai-auth.js';
import type { AiAgentRegistration } from './ai-identity-registry.js';

// ── Command Types ──────────────────────────────────────────────────────────

export type VaultCommandType =
  | 'ROTATE_SECRET'
  | 'REVOKE_ACCESS'
  | 'GENERATE_KEY'
  | 'LOCK_CONTAINER'
  | 'READ_SECRET'
  | 'SIGN_MESSAGE';

export interface BaseCommand {
  type:       VaultCommandType;
  /** Signed JWT from the issuing AI agent */
  agentToken: string;
  /** ISO-8601 timestamp — rejected if > 30 s in the past */
  issuedAt:   string;
  /** Unique idempotency key (prevents replay) */
  commandId:  string;
  /** Optional human-readable rationale for audit trail */
  reason?:    string;
}

export interface RotateSecretCommand extends BaseCommand {
  type:       'ROTATE_SECRET';
  vaultPath:  string;
  encoding?:  'hex' | 'base64';
}

export interface RevokeAccessCommand extends BaseCommand {
  type:        'REVOKE_ACCESS';
  /** Revoke a specific JWT by its jti */
  jti?:        string;
  /** Revoke all tokens for an actor */
  actorId?:    string;
}

export interface GenerateKeyCommand extends BaseCommand {
  type:        'GENERATE_KEY';
  /** Cryptographic algorithm for the new key */
  algorithm:   KeyAlgorithm;
  /** Human-readable key name */
  name:        string;
  /** Chain layer for scoping — defaults to 'all' */
  layer?:      KeyLayer;
  chainId?:    number;
  expiresAt?:  number;
}

export interface LockContainerCommand extends BaseCommand {
  type:        'LOCK_CONTAINER';
  containerId: string;
  urgency:     'low' | 'medium' | 'high' | 'critical';
}

export interface ReadSecretCommand extends BaseCommand {
  type:        'READ_SECRET';
  vaultPath:   string;
}

export interface SignMessageCommand extends BaseCommand {
  type:        'SIGN_MESSAGE';
  keyId:       string;
  messageHex:  string;
  purpose?:    string;
}

export type VaultCommand =
  | RotateSecretCommand
  | RevokeAccessCommand
  | GenerateKeyCommand
  | LockContainerCommand
  | ReadSecretCommand
  | SignMessageCommand;

export interface CommandResult {
  ok:          boolean;
  commandId:   string;
  commandType: VaultCommandType;
  agentId:     string;
  executedAt:  number;
  data?:       unknown;
  error?:      string;
}

// ── Replay Protection ──────────────────────────────────────────────────────

const _seenCommandIds = new Set<string>();
const COMMAND_REPLAY_WINDOW_MS = 60_000;   // 30 s freshness + 30 s grace

function registerAndCheckReplay(commandId: string, issuedAt: string): boolean {
  const ts = Date.parse(issuedAt);
  if (isNaN(ts) || Date.now() - ts > COMMAND_REPLAY_WINDOW_MS) return false;
  if (_seenCommandIds.has(commandId)) return false;
  _seenCommandIds.add(commandId);
  // Evict old ids after window
  setTimeout(() => _seenCommandIds.delete(commandId), COMMAND_REPLAY_WINDOW_MS).unref();
  return true;
}

// ── AiCommandGateway ───────────────────────────────────────────────────────

export class AiCommandGateway {

  constructor(
    private readonly _secrets: SecretManager,
    private readonly _keys:    KeyManager,
    private readonly _audit:   AuditLedger,
    private readonly _events:  typeof VaultEvents,
  ) {}

  // ── Entry Point ──────────────────────────────────────────────────────────

  async execute(cmd: VaultCommand): Promise<CommandResult> {
    // 1 — Replay protection
    if (!registerAndCheckReplay(cmd.commandId, cmd.issuedAt)) {
      return this._fail(cmd, 'Command replayed or expired', 'unknown');
    }

    // 2 — Authenticate
    const auth = await verifyAgentToken(cmd.agentToken);
    if (!auth.ok || !auth.agentId) {
      return this._fail(cmd, auth.error ?? 'Authentication failed', 'unknown');
    }

    // 3 — Dispatch
    try {
      switch (cmd.type) {
        case 'ROTATE_SECRET':    return this._rotateSecret(cmd, auth);
        case 'REVOKE_ACCESS':    return this._revokeAccess(cmd, auth);
        case 'GENERATE_KEY':     return this._generateKey(cmd, auth);
        case 'LOCK_CONTAINER':   return this._lockContainer(cmd, auth);
        case 'READ_SECRET':      return this._readSecret(cmd, auth);
        case 'SIGN_MESSAGE':     return this._signMessage(cmd, auth);
        default: {
          const _exhaustive: never = cmd;
          return this._fail(_exhaustive as VaultCommand, 'Unknown command type', auth.agentId ?? 'unknown');
        }
      }
    } catch (err) {
      return {
        ok:          false,
        commandId:   cmd.commandId,
        commandType: cmd.type,
        agentId:     auth.agentId!,
        executedAt:  Date.now(),
        error:       String(err),
      };
    }
  }

  // ── Command Handlers ─────────────────────────────────────────────────────

  private async _rotateSecret(
    cmd:  RotateSecretCommand,
    auth: AiAuthResult,
  ): Promise<CommandResult> {
    const agentId = auth.agentId!;

    if (!authorizeAgentAction(auth, cmd.vaultPath, 'secret.rotate')) {
      return this._deny(cmd, agentId, cmd.vaultPath, 'secret.rotate');
    }

    const result = await this._secrets.rotate(cmd.vaultPath, {
      actor:     agentId,
      actorType: 'ghostbrain',
      ...(cmd.encoding !== undefined && { encoding: cmd.encoding }),
      ...(cmd.reason   !== undefined && { reason:   cmd.reason }),
    });

    this._audit.append({
      action:    'secret.rotate',
      actor:     agentId,
      actorType: 'ghostbrain',
      resource:  cmd.vaultPath,
      result:    result.ok ? 'success' : 'failure',
      riskScore: 0,
      metadata:  { commandId: cmd.commandId, ...(cmd.reason !== undefined && { reason: cmd.reason }) },
    });

    this._events.emit('secret.rotated', {
      path:      cmd.vaultPath,
      namespace: cmd.vaultPath.split('/')[2] ?? 'default',
      reason:    cmd.reason ?? 'ai-command',
      urgency:   'routine',
      ts:        Date.now(),
      initiator: agentId,
    });

    return this._ok(cmd, agentId, { path: cmd.vaultPath, newVersion: result.newVersion });
  }

  private async _revokeAccess(
    cmd:  RevokeAccessCommand,
    auth: AiAuthResult,
  ): Promise<CommandResult> {
    const agentId = auth.agentId!;

    if (cmd.jti)     revokeToken(cmd.jti);
    if (cmd.actorId) revokeActor(cmd.actorId);

    const target = cmd.jti ?? cmd.actorId ?? '(none)';

    this._audit.append({
      action:    'auth.revoke',
      actor:     agentId,
      actorType: 'ghostbrain',
      resource:  `vault://identity/${target}`,
      result:    'success',
      riskScore: 0.3,
      metadata:  {
        commandId: cmd.commandId,
        ...(cmd.jti      !== undefined && { jti:     cmd.jti }),
        ...(cmd.actorId  !== undefined && { actorId: cmd.actorId }),
        ...(cmd.reason   !== undefined && { reason:  cmd.reason }),
      },
    });

    this._events.emit('agent.command', {
      commandId: cmd.commandId,
      type:      'revoke',
      target,
      initiator: agentId,
      reason:    cmd.reason ?? 'ai-revoke',
      ts:        Date.now(),
    });

    return this._ok(cmd, agentId, { revoked: target });
  }

  private async _generateKey(
    cmd:  GenerateKeyCommand,
    auth: AiAuthResult,
  ): Promise<CommandResult> {
    const agentId = auth.agentId!;
    const reg     = auth.reg as AiAgentRegistration;

    if (!reg.allowedActions.includes('key.generate')) {
      return this._deny(cmd, agentId, `key.generate:${cmd.name}`, 'key.generate');
    }

    const layer: KeyLayer = cmd.layer ?? 'all';
    const record = await this._keys.generate({
      name:      cmd.name,
      purpose:   'signing',
      algorithm: cmd.algorithm,
      layer,
      actor:     agentId,
      ...(cmd.chainId   !== undefined && { chainId:   cmd.chainId }),
      ...(cmd.expiresAt !== undefined && { expiresAt: cmd.expiresAt }),
    });

    this._audit.append({
      action:    'key.generate',
      actor:     agentId,
      actorType: 'ghostbrain',
      resource:  `vault://keys/${record.id}`,
      result:    'success',
      riskScore: 0,
      metadata:  { commandId: cmd.commandId, algorithm: cmd.algorithm, name: cmd.name, layer },
    });

    this._events.emit('key.rotated', {
      keyId:     record.id,
      keyName:   record.name,
      layer,
      purpose:   record.purpose,
      publicKey: record.publicKey ?? '',
      reason:    `ai-generate:${cmd.name}`,
      ts:        Date.now(),
      initiator: agentId,
    });

    return this._ok(cmd, agentId, { keyId: record.id, publicKey: record.publicKey });
  }

  private async _lockContainer(
    cmd:  LockContainerCommand,
    auth: AiAuthResult,
  ): Promise<CommandResult> {
    const agentId = auth.agentId!;

    this._audit.append({
      action:    'agent.action',
      actor:     agentId,
      actorType: 'ghostbrain',
      resource:  `vault://docker/${cmd.containerId}`,
      result:    'success',
      riskScore: cmd.urgency === 'critical' ? 0.9 : cmd.urgency === 'high' ? 0.7 : 0.4,
      metadata:  {
        commandId:   cmd.commandId,
        urgency:     cmd.urgency,
        containerId: cmd.containerId,
        ...(cmd.reason !== undefined && { reason: cmd.reason }),
      },
    });

    this._events.emit('agent.command', {
      commandId: cmd.commandId,
      type:      'lock',
      target:    cmd.containerId,
      initiator: agentId,
      reason:    cmd.reason ?? 'ai-lockdown',
      ts:        Date.now(),
    });

    return this._ok(cmd, agentId, { containerId: cmd.containerId, locked: true });
  }

  private async _readSecret(
    cmd:  ReadSecretCommand,
    auth: AiAuthResult,
  ): Promise<CommandResult> {
    const agentId = auth.agentId!;

    if (!authorizeAgentAction(auth, cmd.vaultPath, 'secret.read')) {
      return this._deny(cmd, agentId, cmd.vaultPath, 'secret.read');
    }

    const val = await this._secrets.get(cmd.vaultPath, agentId, 'ghostbrain');

    this._audit.append({
      action:    'secret.read',
      actor:     agentId,
      actorType: 'ghostbrain',
      resource:  cmd.vaultPath,
      result:    val ? 'success' : 'denied',
      riskScore: 0,
      metadata:  { commandId: cmd.commandId },
    });

    if (!val) return this._fail(cmd, 'Secret not found', agentId);
    return this._ok(cmd, agentId, { value: val.value });
  }

  private async _signMessage(
    cmd:  SignMessageCommand,
    auth: AiAuthResult,
  ): Promise<CommandResult> {
    const agentId = auth.agentId!;
    const reg     = auth.reg as AiAgentRegistration;

    if (!reg.allowedActions.includes('key.sign')) {
      return this._deny(cmd, agentId, `key.sign:${cmd.keyId}`, 'key.sign');
    }

    const message = Buffer.from(cmd.messageHex, 'hex');
    const result  = await this._keys.sign(cmd.keyId, message, agentId, cmd.purpose);

    this._audit.append({
      action:    'key.sign',
      actor:     agentId,
      actorType: 'ghostbrain',
      resource:  `vault://keys/${cmd.keyId}`,
      result:    'success',
      riskScore: 0.1,
      metadata:  {
        commandId:  cmd.commandId,
        keyId:      cmd.keyId,
        messageLen: String(message.length),
        ...(cmd.purpose !== undefined && { purpose: cmd.purpose }),
      },
    });

    return this._ok(cmd, agentId, { signatureHex: result.signature, keyId: cmd.keyId });
  }

  // ── Result Helpers ───────────────────────────────────────────────────────

  private _ok(cmd: VaultCommand, agentId: string, data?: unknown): CommandResult {
    return { ok: true,  commandId: cmd.commandId, commandType: cmd.type, agentId, executedAt: Date.now(), data };
  }

  private _fail(cmd: VaultCommand, error: string, agentId: string): CommandResult {
    return { ok: false, commandId: cmd.commandId, commandType: cmd.type, agentId, executedAt: Date.now(), error };
  }

  private _deny(
    cmd:      VaultCommand,
    agentId:  string,
    resource: string,
    _action:  string,
  ): CommandResult {
    this._audit.append({
      action:    'auth.deny',
      actor:     agentId,
      actorType: 'ghostbrain',
      resource,
      result:    'denied',
      riskScore: 0.5,
      metadata:  { commandId: cmd.commandId, commandType: cmd.type },
    });
    return this._fail(cmd, `Agent '${agentId}' not authorized for ${resource}`, agentId);
  }
}
