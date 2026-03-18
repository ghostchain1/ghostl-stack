// GhostNode SDK — Validator Node Management

import type { GhostNodeConfig, GhostNodeStatus, GhostNodeInfo } from '../types.js';

export interface GhostValidatorKeys {
  blsPublicKey: string;
  ecdsaAddress: string;
}

export interface GhostSlashingEvent {
  epoch: number;
  validator: string;
  reason: string;
  amount: string;  // GST units
  txHash: string;
}

/**
 * GhostValidator — manages a GhostChain L1 validator node.
 *
 * Chain IDs:
 *  L1 → 14000101 (RPC :18545)
 *  L2 → 901      (RPC :29547)
 *  L3 → 903      (RPC :39545)
 */
export class GhostValidator {
  private readonly config: GhostNodeConfig;

  // GhostChain canonical chain IDs
  static readonly CHAIN_IDS = { L1: 14000101, L2: 901, L3: 903 } as const;

  constructor(config: GhostNodeConfig) {
    this.config = config;
  }

  /** Get current node information */
  async info(): Promise<GhostNodeInfo> {
    return this._rpc<GhostNodeInfo>('ghost_nodeInfo');
  }

  /** Get sync and health status */
  async status(): Promise<GhostNodeStatus> {
    const [block, syncing, peers] = await Promise.all([
      this._rpc<string>('ghost_blockNumber'),
      this._rpc<boolean | { syncing: boolean }>('ghost_syncing'),
      this._rpc<string>('ghost_peerCount'),
    ]);

    const synced = syncing === false || (typeof syncing === 'object' && !syncing.syncing);

    return {
      layer: this.config.layer,
      role: 'validator',
      synced,
      blockNumber: BigInt(block),
      blockHash: '',
      peers: parseInt(peers, 16),
      uptimeSeconds: 0,
      healthy: synced,
    };
  }

  /** Get validator signing keys */
  async getKeys(): Promise<GhostValidatorKeys> {
    return this._rpc<GhostValidatorKeys>('ghost_validatorKeys');
  }

  /** Start block production (if governance-approved) */
  async startBlockProduction(): Promise<{ started: boolean }> {
    return this._rpc('ghost_startBlockProduction');
  }

  /** Stop block production gracefully */
  async stopBlockProduction(): Promise<{ stopped: boolean }> {
    return this._rpc('ghost_stopBlockProduction');
  }

  /** Get slashing events for this validator */
  async slashingHistory(limit = 20): Promise<GhostSlashingEvent[]> {
    return this._rpc('ghost_slashingHistory', [limit]);
  }

  /** Sync status as a human-readable string */
  async syncStatus(): Promise<string> {
    const s = await this.status();
    return s.synced
      ? `Synced at block ${s.blockNumber} | peers: ${s.peers}`
      : `Syncing... block ${s.blockNumber} | peers: ${s.peers}`;
  }

  /** Check liveness — returns true if the node responds within 5s */
  async isAlive(): Promise<boolean> {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      await this._rpc('ghost_chainId', [], ctrl.signal);
      clearTimeout(timer);
      return true;
    } catch {
      return false;
    }
  }

  private async _rpc<T>(method: string, params: unknown[] = [], signal?: AbortSignal): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.config.authToken) headers['Authorization'] = `Bearer ${this.config.authToken}`;

    const res = await fetch(this.config.rpc, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal,
    });

    if (!res.ok) throw new Error(`GhostNode RPC error: ${res.status}`);
    const json = (await res.json()) as { result?: T; error?: { code: number; message: string } };
    if (json.error) throw new Error(`GhostNode [${method}]: ${json.error.message}`);
    return json.result as T;
  }
}
