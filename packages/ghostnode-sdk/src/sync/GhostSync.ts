// GhostNode SDK — Chain Sync Utilities

import type { GhostNodeConfig } from '../types.js';

export interface GhostSyncState {
  synced: boolean;
  currentBlock: bigint;
  highestBlock: bigint;
  knownStates?: bigint;
  pulledStates?: bigint;
}

/**
 * GhostSync — provides sync state monitoring and wait-until-synced helpers.
 */
export class GhostSync {
  private readonly config: GhostNodeConfig;

  constructor(config: GhostNodeConfig) {
    this.config = config;
  }

  /** Current sync state */
  async state(): Promise<GhostSyncState> {
    const result = await this._rpc<boolean | { currentBlock: string; highestBlock: string }>('ghost_syncing');

    if (result === false) {
      const block = await this._rpc<string>('ghost_blockNumber');
      return { synced: true, currentBlock: BigInt(block), highestBlock: BigInt(block) };
    }

    const r = result as { currentBlock: string; highestBlock: string };
    return {
      synced: false,
      currentBlock: BigInt(r.currentBlock),
      highestBlock: BigInt(r.highestBlock),
    };
  }

  /**
   * Wait until the node is fully synced.
   * Polls at `intervalMs` (default 3000) and resolves when currentBlock >= highestBlock.
   */
  async waitUntilSynced(intervalMs = 3000, timeoutMs = 0): Promise<void> {
    const deadline = timeoutMs > 0 ? Date.now() + timeoutMs : Infinity;

    return new Promise((resolve, reject) => {
      const poll = async () => {
        try {
          const s = await this.state();
          if (s.synced) return resolve();
          if (Date.now() >= deadline) return reject(new Error('GhostSync: timeout waiting for sync'));
          setTimeout(poll, intervalMs);
        } catch (err) {
          reject(err);
        }
      };
      void poll();
    });
  }

  /** Progress percentage (0–100) */
  async progressPercent(): Promise<number> {
    const s = await this.state();
    if (s.synced) return 100;
    if (s.highestBlock === 0n) return 0;
    return Number((s.currentBlock * 100n) / s.highestBlock);
  }

  private async _rpc<T>(method: string, params: unknown[] = []): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.config.authToken) headers['Authorization'] = `Bearer ${this.config.authToken}`;

    const res = await fetch(this.config.rpc, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });

    if (!res.ok) throw new Error(`GhostSync RPC error: ${res.status}`);
    const json = (await res.json()) as { result?: T; error?: { message: string } };
    if (json.error) throw new Error(`GhostSync: ${json.error.message}`);
    return json.result as T;
  }
}
