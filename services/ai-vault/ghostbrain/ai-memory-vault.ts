/**
 * GhostStack AI Vault — GhostBrain Memory Vault
 *
 * Provides encrypted persistent storage for GhostBrain's long-term memory:
 *   - Learned security patterns (anomaly baselines)
 *   - Historical risk model parameters
 *   - Agent operational state (resumable after restart)
 *   - Cross-session policy learning
 *   - Threat intelligence accumulation
 *
 * All memory is encrypted at rest using the vault's AES-256-GCM engine
 * and stored under the `vault://ai-memory/` path hierarchy.
 *
 * Memory entries have optional TTLs (for session state) or are permanent
 * (for accumulated intelligence).
 *
 * GhostChain L1 (14000101) | L2 (901) | L3 (903) | GST gas token
 */

import { SecretManager } from '../core/secret-manager.js';
import { AuditLedger }   from '../storage/audit-ledger.js';

// ── Memory Categories ──────────────────────────────────────────────────────

export type MemoryCategory =
  | 'learning'            // ML training data, baseline parameters
  | 'risk-model'          // calibrated risk weights and thresholds
  | 'threat-intel'        // accumulated threat patterns and IOCs
  | 'operational-state'   // agent checkpoint / resumable state
  | 'policy-delta'        // policy refinements proposed by AI
  | 'anomaly-baseline'    // behavior baselines per actor/resource
  | 'session';            // short-lived session context

const CATEGORY_PREFIXES: Record<MemoryCategory, string> = {
  'learning':           'vault://ai-memory/learning/',
  'risk-model':         'vault://ai-memory/risk-model/',
  'threat-intel':       'vault://ai-memory/threat-intel/',
  'operational-state':  'vault://ai-memory/operational-state/',
  'policy-delta':       'vault://ai-memory/policy-delta/',
  'anomaly-baseline':   'vault://ai-memory/anomaly-baseline/',
  'session':            'vault://ai-memory/session/',
};

// ── Types ──────────────────────────────────────────────────────────────────

export interface MemoryEntry<T = unknown> {
  key:       string;
  category:  MemoryCategory;
  data:      T;
  agentId:   string;
  storedAt:  number;
  expiresAt?: number;
  version:   number;
}

export interface StoreMemoryOpts {
  /** TTL in seconds — omit for permanent storage */
  ttlSecs?:  number;
  /** Caller actor id for audit trail */
  actorId?:  string;
}

export interface RetrieveMemoryOpts {
  /** Caller actor id for audit trail */
  actorId?:  string;
}

// ── AiMemoryVault ──────────────────────────────────────────────────────────

export class AiMemoryVault {

  constructor(
    private readonly _secrets: SecretManager,
    private readonly _audit:   AuditLedger,
  ) {}

  // ── Private helpers ──────────────────────────────────────────────────────

  private _path(agentId: string, category: MemoryCategory, key: string): string {
    return `${CATEGORY_PREFIXES[category]}${agentId}/${key}`;
  }

  private _serialize(data: unknown): string {
    return JSON.stringify(data);
  }

  private _deserialize<T>(raw: string): T {
    return JSON.parse(raw) as T;
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /**
   * Store (or overwrite) a memory entry under `vault://ai-memory/<category>/<agentId>/<key>`.
   */
  async store<T>(
    agentId:  string,
    category: MemoryCategory,
    key:      string,
    data:     T,
    opts:     StoreMemoryOpts = {},
  ): Promise<void> {
    const vaultPath  = this._path(agentId, category, key);
    const serialized = this._serialize(data);
    const actorId    = opts.actorId ?? agentId;

    const expiresAt  = opts.ttlSecs !== undefined
      ? Math.floor(Date.now() / 1_000) + opts.ttlSecs
      : undefined;

    await this._secrets.store(vaultPath, serialized, {
      type:   'generic',
      actor:  actorId,
      actorType: 'ghostbrain',
      ...(expiresAt !== undefined && { expiresAt }),
    });

    this._audit.append({
      action:    'secret.write',
      actor:     actorId,
      actorType: 'ghostbrain',
      resource:  vaultPath,
      result:    'success',
      riskScore: 0,
      metadata:  { category, key, agentId, hasTtl: String(opts.ttlSecs !== undefined) },
    });
  }

  /**
   * Retrieve and deserialize a memory entry.  Returns `null` if the key
   * does not exist or has expired.
   */
  async retrieve<T = unknown>(
    agentId:  string,
    category: MemoryCategory,
    key:      string,
    opts:     RetrieveMemoryOpts = {},
  ): Promise<T | null> {
    const vaultPath = this._path(agentId, category, key);
    const actorId   = opts.actorId ?? agentId;

    const result = await this._secrets.get(vaultPath, actorId, 'ghostbrain');
    if (!result) return null;

    this._audit.append({
      action:    'secret.read',
      actor:     actorId,
      actorType: 'ghostbrain',
      resource:  vaultPath,
      result:    'success',
      riskScore: 0,
      metadata:  { category, key, agentId },
    });

    return this._deserialize<T>(result.value);
  }

  /**
   * Delete a memory entry.
   */
  async forget(
    agentId:  string,
    category: MemoryCategory,
    key:      string,
    actorId?: string,
  ): Promise<void> {
    const vaultPath = this._path(agentId, category, key);
    const actor     = actorId ?? agentId;

    // Store an empty tombstone with immediate expiry to signal deletion
    await this._secrets.store(vaultPath, '__deleted__', {
      type:      'generic',
      actor,
      actorType: 'ghostbrain',
      expiresAt: Math.floor(Date.now() / 1_000),
    });

    this._audit.append({
      action:    'secret.delete',
      actor,
      actorType: 'ghostbrain',
      resource:  vaultPath,
      result:    'success',
      riskScore: 0,
      metadata:  { category, key, agentId },
    });
  }

  /**
   * Merge `patch` into an existing JSON object entry.  Uses optimistic
   * read-modify-write — caller should retry on conflict if needed.
   */
  async patch<T extends Record<string, unknown>>(
    agentId:  string,
    category: MemoryCategory,
    key:      string,
    patch:    Partial<T>,
    opts:     StoreMemoryOpts = {},
  ): Promise<T> {
    const existing: Partial<T> = (await this.retrieve<T>(agentId, category, key, opts)) ?? {};
    const merged   = { ...existing, ...patch } as T;
    await this.store(agentId, category, key, merged, opts);
    return merged;
  }

  /**
   * Append an item to a memory list.  Creates the list if it does not exist.
   * Trims the list to `maxItems` from the tail.
   */
  async appendToList<T>(
    agentId:  string,
    category: MemoryCategory,
    key:      string,
    item:     T,
    maxItems  = 1_000,
    opts:     StoreMemoryOpts = {},
  ): Promise<void> {
    const existing: T[] = (await this.retrieve<T[]>(agentId, category, key, opts)) ?? [];
    existing.push(item);
    const trimmed = existing.length > maxItems ? existing.slice(-maxItems) : existing;
    await this.store(agentId, category, key, trimmed, opts);
  }

  /**
   * Read a list entry, returning an empty array if it doesn't exist.
   */
  async readList<T>(
    agentId:  string,
    category: MemoryCategory,
    key:      string,
    opts?:    RetrieveMemoryOpts,
  ): Promise<T[]> {
    return (await this.retrieve<T[]>(agentId, category, key, opts)) ?? [];
  }

  /**
   * Store GhostBrain's calibrated risk model weights.
   */
  async storeRiskModel(
    agentId: string,
    weights: Record<string, number>,
    opts?:   StoreMemoryOpts,
  ): Promise<void> {
    await this.store(agentId, 'risk-model', 'weights', weights, opts);
  }

  /**
   * Retrieve GhostBrain's calibrated risk model weights.
   */
  async retrieveRiskModel(agentId: string): Promise<Record<string, number> | null> {
    return this.retrieve<Record<string, number>>(agentId, 'risk-model', 'weights');
  }

  /**
   * Checkpoint agent operational state (for restart recovery).
   */
  async checkpoint(
    agentId: string,
    state:   Record<string, unknown>,
  ): Promise<void> {
    await this.store(agentId, 'operational-state', 'checkpoint', {
      ...state,
      checkpointAt: Date.now(),
    });
  }

  /**
   * Restore agent operational state checkpoint.
   */
  async restoreCheckpoint(
    agentId: string,
  ): Promise<Record<string, unknown> | null> {
    return this.retrieve<Record<string, unknown>>(agentId, 'operational-state', 'checkpoint');
  }
}
