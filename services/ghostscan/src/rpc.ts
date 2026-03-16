/**
 * GhostScan RPC Client — communicates with GhostChain L1/L2/L3 nodes
 * Uses ghost_* RPC methods exclusively.
 */

import type { GhostLayer } from './index.js';

export interface GhostBlockRPC {
  number: string;       // hex
  hash: string;
  parentHash: string;
  miner: string;        // proposer
  gasUsed: string;      // hex
  gasLimit: string;     // hex
  timestamp: string;    // hex
  transactions: string[] | GhostTxRPC[];
}

export interface GhostTxRPC {
  hash: string;
  from: string;
  to: string | null;
  value: string;        // hex wei
  gas: string;          // hex
  gasPrice: string;     // hex
  nonce: string;        // hex
  input: string;
  blockNumber: string;
}

type LayerConfig = { chainId: number; rpc: string; name: string };
type BlockCallback = (event: { layer: GhostLayer; block: GhostBlockRPC }) => void;

export class GhostRPC {
  private layers: Record<string, LayerConfig>;
  private blockListeners: Array<{ layers: GhostLayer[]; cb: BlockCallback }> = [];

  constructor(layers: Record<string, LayerConfig>) {
    this.layers = layers;
  }

  async call(layer: GhostLayer, method: string, params: unknown[] = []): Promise<unknown> {
    const config = this.layers[layer];
    if (!config) throw new Error(`Unknown layer: ${layer}`);

    const res = await fetch(config.rpc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });

    if (!res.ok) throw new Error(`GhostRPC HTTP ${res.status} from ${config.rpc}`);
    const json = await res.json() as { result?: unknown; error?: { message: string } };
    if (json.error) throw new Error(`GhostRPC error: ${json.error.message}`);
    return json.result;
  }

  async getBlockByNumber(layer: GhostLayer, height: number | 'latest'): Promise<GhostBlockRPC | null> {
    const tag = height === 'latest' ? 'latest' : `0x${height.toString(16)}`;
    return this.call(layer, 'ghost_getBlockByNumber', [tag, true]) as Promise<GhostBlockRPC | null>;
  }

  async getBlockNumber(layer: GhostLayer): Promise<number> {
    const result = await this.call(layer, 'ghost_blockNumber', []) as string;
    return parseInt(result, 16);
  }

  async getTransaction(layer: GhostLayer, hash: string): Promise<GhostTxRPC | null> {
    return this.call(layer, 'ghost_getTransactionByHash', [hash]) as Promise<GhostTxRPC | null>;
  }

  async getCode(layer: GhostLayer, address: string): Promise<string> {
    return this.call(layer, 'ghost_getCode', [address, 'latest']) as Promise<string>;
  }

  /**
   * Register a callback for new block events across the given layers.
   * Returns a cleanup function.
   */
  onBlock(layers: GhostLayer[], cb: BlockCallback): () => void {
    const entry = { layers, cb };
    this.blockListeners.push(entry);
    return () => {
      const idx = this.blockListeners.indexOf(entry);
      if (idx !== -1) this.blockListeners.splice(idx, 1);
    };
  }

  /** Emit a block event to all registered listeners */
  emitBlock(layer: GhostLayer, block: GhostBlockRPC): void {
    for (const { layers, cb } of this.blockListeners) {
      if (layers.includes(layer)) {
        try { cb({ layer, block }); } catch (_) { /* ignore listener errors */ }
      }
    }
  }
}
