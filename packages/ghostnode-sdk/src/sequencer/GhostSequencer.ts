// GhostNode SDK — Sequencer Node (L2/L3 OP-Stack)

import type { GhostNodeConfig } from '../types.js';

export interface GhostSequencerStatus {
  running: boolean;
  epoch: string;
  safeBlock: string;
  finalizedBlock: string;
  batcherAddress: string;
  sequencerAddress: string;
}

/**
 * GhostSequencer — manages OP-Stack based L2/L3 sequencer nodes.
 * L2 chain ID: 901 (RPC :29547)
 * L3 chain ID: 903 (RPC :39545)
 */
export class GhostSequencer {
  private readonly config: GhostNodeConfig;

  constructor(config: GhostNodeConfig) {
    if (config.layer === 'L1') throw new Error('GhostSequencer is for L2/L3 only. Use GhostValidator for L1.');
    this.config = config;
  }

  /** Get OP-Stack sequencer rollup status */
  async status(): Promise<GhostSequencerStatus> {
    return this._rpc<GhostSequencerStatus>('optimism_syncStatus');
  }

  /** Get the output root at a given block */
  async outputAtBlock(blockNumber: bigint): Promise<{ outputRoot: string; blockRef: string }> {
    return this._rpc('optimism_outputAtBlock', [`0x${blockNumber.toString(16)}`]);
  }

  /** Get rollup config */
  async rollupConfig(): Promise<Record<string, unknown>> {
    return this._rpc('optimism_rollupConfig');
  }

  /** Get the safe head reference */
  async safeHead(): Promise<{ hash: string; number: bigint }> {
    const status = await this.status();
    return { hash: status.safeBlock, number: BigInt(status.safeBlock) };
  }

  /** Get the finalized head reference */
  async finalizedHead(): Promise<{ hash: string; number: bigint }> {
    const status = await this.status();
    return { hash: status.finalizedBlock, number: BigInt(status.finalizedBlock) };
  }

  private async _rpc<T>(method: string, params: unknown[] = []): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.config.authToken) headers['Authorization'] = `Bearer ${this.config.authToken}`;

    const res = await fetch(this.config.rpc, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });

    if (!res.ok) throw new Error(`GhostSequencer RPC error: ${res.status}`);
    const json = (await res.json()) as { result?: T; error?: { message: string } };
    if (json.error) throw new Error(`GhostSequencer [${method}]: ${json.error.message}`);
    return json.result as T;
  }
}
