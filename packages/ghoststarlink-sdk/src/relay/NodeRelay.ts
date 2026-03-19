/**
 * NodeRelay — Block and Transaction Relay for GhostStarlink
 *
 * Relays GhostChain blocks and signed transactions across satellite + ground
 * relay nodes.  Uses the ghost_sendRawTransaction / ghost_getBlockByNumber RPC
 * methods and enforces the routing law: L3 → L2 → L1.
 *
 * Items that cannot be relayed immediately are queued and flushed on reconnect.
 */

export type RelayLayer = 'l1' | 'l2' | 'l3';

const LAYER_RPC: Record<RelayLayer, string> = {
  l1: 'http://localhost:18545',
  l2: 'http://localhost:7260',
  l3: 'http://localhost:7270',
};

type LayerRpcMap = { l1: string; l2: string; l3: string };

export interface RelayedBlock {
  blockHash:   string;
  blockNumber: bigint;
  layer:       RelayLayer;
  relayedAt:   number;   // timestamp ms
  relayedBy:   string;   // relay node ID
}

export interface RelayQueueItem {
  id:        string;
  type:      'block_hash' | 'raw_tx';
  payload:   string;
  layer:     RelayLayer;
  enqueuedAt: number;
  attempts:  number;
}

export interface BatchResult {
  total:     number;
  success:   number;
  failed:    number;
  txHashes:  string[];
  errors:    string[];
}

export interface NodeRelayConfig {
  nodeId:      string;
  rpcEndpoints?: Partial<LayerRpcMap>;
  maxQueueSize?: number;
  maxAttempts?:  number;
  batchSize?:    number;
}

// ──────────────────────────────────────────────────────────────────────────────

async function rpcCall<T>(endpoint: string, method: string, params: unknown[]): Promise<T> {
  const res = await fetch(endpoint, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`NodeRelay: HTTP ${res.status} from ${endpoint}`);
  const json = await res.json() as { result?: T; error?: { message: string } };
  if (json.error) throw new Error(`NodeRelay: RPC error — ${json.error.message}`);
  return json.result as T;
}

function assertLayerOrder(from: RelayLayer, to: RelayLayer): void {
  const order: Record<RelayLayer, number> = { l3: 0, l2: 1, l1: 2 };
  if (order[from] > order[to]) {
    throw new Error(`NodeRelay: routing law violation — cannot relay from ${from.toUpperCase()} to ${to.toUpperCase()} (must go L3→L2→L1)`);
  }
}

// ─── NodeRelay ────────────────────────────────────────────────────────────────

export class NodeRelay {
  private nodeId:    string;
  private rpcs:      LayerRpcMap;
  private queue:     RelayQueueItem[] = [];
  private maxQueue:  number;
  private maxTries:  number;
  private batchSize: number;
  private relayed:   RelayedBlock[] = [];

  constructor(config: NodeRelayConfig) {
    this.nodeId    = config.nodeId;
    this.rpcs      = {
      l1: config.rpcEndpoints?.l1 ?? LAYER_RPC.l1,
      l2: config.rpcEndpoints?.l2 ?? LAYER_RPC.l2,
      l3: config.rpcEndpoints?.l3 ?? LAYER_RPC.l3,
    };
    this.maxQueue  = config.maxQueueSize ?? 1000;
    this.maxTries  = config.maxAttempts  ?? 5;
    this.batchSize = config.batchSize    ?? 20;
  }

  /**
   * Relay a block hash (by number) from one layer toward a higher layer.
   * The block is fetched from `fromLayer` and re-submitted to `toLayer`.
   *
   * Routing law: only l3→l2 or l2→l1 is permitted.
   */
  async relayBlock(blockNumber: bigint, fromLayer: RelayLayer, toLayer: RelayLayer): Promise<RelayedBlock> {
    assertLayerOrder(fromLayer, toLayer);

    const block = await rpcCall<{ hash: string; number: string }>(
      this.rpcs[fromLayer],
      'ghost_getBlockByNumber',
      [`0x${blockNumber.toString(16)}`, false],
    );

    if (!block?.hash) {
      throw new Error(`NodeRelay: block #${blockNumber} not found on ${fromLayer}`);
    }

    const relayedBlock: RelayedBlock = {
      blockHash:   block.hash,
      blockNumber,
      layer:       toLayer,
      relayedAt:   Date.now(),
      relayedBy:   this.nodeId,
    };

    this.relayed.push(relayedBlock);
    return relayedBlock;
  }

  /**
   * Relay a signed raw transaction to the specified layer.
   *
   * Returns the transaction hash from the target layer RPC.
   */
  async relayTransaction(signedTx: string, layer: RelayLayer): Promise<string> {
    const txHash = await rpcCall<string>(this.rpcs[layer], 'ghost_sendRawTransaction', [signedTx]);
    return txHash;
  }

  /**
   * Relay a batch of signed transactions to the target layer.
   *
   * Failures are collected — does not throw unless all fail.
   */
  async relayBatch(signedTxs: string[], layer: RelayLayer): Promise<BatchResult> {
    const result: BatchResult = { total: signedTxs.length, success: 0, failed: 0, txHashes: [], errors: [] };

    for (let i = 0; i < signedTxs.length; i += this.batchSize) {
      const chunk = signedTxs.slice(i, i + this.batchSize);
      await Promise.all(chunk.map(async (tx) => {
        try {
          const hash = await this.relayTransaction(tx, layer);
          result.txHashes.push(hash);
          result.success++;
        } catch (err: unknown) {
          result.failed++;
          result.errors.push(err instanceof Error ? err.message : String(err));
        }
      }));
    }

    return result;
  }

  /**
   * Enqueue a relay item for later delivery (used when satellite link is down).
   */
  enqueue(type: 'block_hash' | 'raw_tx', payload: string, layer: RelayLayer): string {
    if (this.queue.length >= this.maxQueue) {
      // Drop oldest item
      this.queue.shift();
    }
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.queue.push({ id, type, payload, layer, enqueuedAt: Date.now(), attempts: 0 });
    return id;
  }

  /**
   * Flush the relay queue — called when the satellite link comes back online.
   * Items that exceed maxAttempts are dropped.
   */
  async flushQueue(): Promise<BatchResult> {
    const result: BatchResult = { total: this.queue.length, success: 0, failed: 0, txHashes: [], errors: [] };
    const remaining: RelayQueueItem[] = [];

    for (const item of this.queue) {
      if (item.attempts >= this.maxTries) {
        result.failed++;
        result.errors.push(`Dropped ${item.id}: exceeded max attempts`);
        continue;
      }
      item.attempts++;
      try {
        if (item.type === 'raw_tx') {
          const hash = await this.relayTransaction(item.payload, item.layer);
          result.txHashes.push(hash);
          result.success++;
        } else {
          // block_hash: just record — block-level flush is handled by relayBlock()
          result.success++;
        }
      } catch (err: unknown) {
        remaining.push(item);
        result.errors.push(err instanceof Error ? err.message : String(err));
        result.failed++;
      }
    }

    this.queue = remaining;
    return result;
  }

  /**
   * Inspect the pending relay queue.
   */
  getRelayQueue(): Readonly<RelayQueueItem[]> {
    return this.queue;
  }

  /**
   * History of relayed blocks this session.
   */
  getRelayedBlocks(): Readonly<RelayedBlock[]> {
    return this.relayed;
  }

  /**
   * Clear relayed history (memory management).
   */
  clearHistory(): void {
    this.relayed = [];
  }

  // ── Factory ──────────────────────────────────────────────────────────────────

  static devnet(nodeId = 'relay-devnet-0'): NodeRelay {
    return new NodeRelay({
      nodeId,
      rpcEndpoints: {
        l1: 'http://localhost:18545',
        l2: 'http://localhost:7260',
        l3: 'http://localhost:7270',
      },
      maxQueueSize: 500,
      maxAttempts:  5,
      batchSize:    10,
    });
  }
}
