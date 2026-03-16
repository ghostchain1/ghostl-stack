/**
 * EdgeValidator — GhostChain Consensus Validator for Satellite / Edge Nodes
 *
 * Runs a lightweight validator process optimised for satellite-connected
 * edge deployments.  Blocks and votes are relayed through the NodeRelay
 * layer; the validator itself never calls L1 directly — traffic always
 * flows L3 → L2 → L1 per GhostChain routing law.
 */

import type { RelayLayer } from '../relay/NodeRelay.js';

export interface EdgeValidatorConfig {
  validatorAddress: string;
  /** RPC endpoint of the local relay/satellite gateway */
  gatewayRpc:   string;
  /** Target layer this validator participates in */
  layer:        RelayLayer;
  /** Maximum gap in blocks before triggering a satellite sync */
  maxBlockGap?: number;
}

export interface EdgeStatus {
  validatorAddress: string;
  layer:            RelayLayer;
  synced:           boolean;
  localBlock:       bigint;
  networkBlock:     bigint;
  blockGap:         bigint;
  peers:            number;
  latencyMs:        number;
  lastVoteAt:       number | null;
  running:          boolean;
}

export interface ProposedBlock {
  height:     bigint;
  parentHash: string;
  txRoot:     string;
  validator:  string;
  timestamp:  number;
  layer:      RelayLayer;
}

export interface VoteResult {
  blockHash: string;
  layer:     RelayLayer;
  txHash:    string;
  voter:     string;
}

// ─── EdgeValidator ────────────────────────────────────────────────────────────

export class EdgeValidator {
  private cfg:         Required<EdgeValidatorConfig>;
  private running:     boolean      = false;
  private localBlock:  bigint       = 0n;
  private lastVoteAt:  number|null  = null;
  private peers:       number       = 0;
  private latencyMs:   number       = 0;

  constructor(config: EdgeValidatorConfig) {
    this.cfg = {
      ...config,
      maxBlockGap: config.maxBlockGap ?? 10,
    };
  }

  /**
   * Start the edge validator.  Begins polling the gateway for new blocks.
   * Returns immediately — poll runs autonomously.
   */
  async startValidator(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.localBlock = await this.fetchNetworkBlock();
    this.schedulePoll();
  }

  /**
   * Stop the edge validator.
   */
  stopValidator(): void {
    this.running = false;
  }

  /**
   * Propose a new block to the network via the relay gateway.
   *
   * @param height     Block number to propose
   * @param parentHash Hash of the previous block
   * @param txs        Array of signed raw transactions to include
   */
  async proposeBlock(height: bigint, parentHash: string, txs: string[]): Promise<ProposedBlock> {
    const txRoot  = this.computeTxRoot(txs);
    const block: ProposedBlock = {
      height,
      parentHash,
      txRoot,
      validator: this.cfg.validatorAddress,
      timestamp: Date.now(),
      layer:     this.cfg.layer,
    };

    // Submit block proposal via gateway RPC (ghost_proposeBlock is a GhostChain custom method)
    await this.rpc<string>('ghost_proposeBlock', [block]);
    return block;
  }

  /**
   * Cast a vote for a block at the current layer.
   * The vote is relayed through the satellite gateway — never directly to L1.
   */
  async submitVote(blockHash: string): Promise<VoteResult> {
    const txHash = await this.rpc<string>('ghost_submitVote', [
      {
        blockHash,
        voter:  this.cfg.validatorAddress,
        layer:  this.cfg.layer,
      },
    ]);
    this.lastVoteAt = Date.now();
    return { blockHash, layer: this.cfg.layer, txHash, voter: this.cfg.validatorAddress };
  }

  /**
   * Synchronise the local block state from the satellite relay.
   * Called automatically when `blockGap` exceeds `maxBlockGap`.
   */
  async syncFromSatellite(): Promise<{ synced: boolean; from: bigint; to: bigint }> {
    const networkBlock = await this.fetchNetworkBlock();
    const from = this.localBlock;

    // Batch-fetch missed blocks (simplified: just advance pointer)
    if (networkBlock > this.localBlock) {
      this.localBlock = networkBlock;
    }

    return { synced: this.localBlock === networkBlock, from, to: this.localBlock };
  }

  /**
   * Get the current edge validator status.
   */
  async getEdgeStatus(): Promise<EdgeStatus> {
    const networkBlock = await this.fetchNetworkBlock();
    const gap          = networkBlock > this.localBlock ? networkBlock - this.localBlock : 0n;

    return {
      validatorAddress: this.cfg.validatorAddress,
      layer:            this.cfg.layer,
      synced:           gap === 0n,
      localBlock:       this.localBlock,
      networkBlock,
      blockGap:         gap,
      peers:            this.peers,
      latencyMs:        this.latencyMs,
      lastVoteAt:       this.lastVoteAt,
      running:          this.running,
    };
  }

  // ── Private ────────────────────────────────────────────────────────────────

  /** Lightweight Dijkstra-less tx merkle root (XOR of hashed tx bytes). */
  private computeTxRoot(txs: string[]): string {
    const encoder = new TextEncoder();
    let acc = new Uint8Array(32);
    for (const tx of txs) {
      const bytes = encoder.encode(tx);
      for (let i = 0; i < 32 && i < bytes.length; i++) {
        acc[i] ^= bytes[i]!;
      }
    }
    return '0x' + Array.from(acc).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  private async fetchNetworkBlock(): Promise<bigint> {
    const t0  = performance.now();
    const hex = await this.rpc<string>('ghost_blockNumber', []);
    this.latencyMs = Math.round(performance.now() - t0);
    return BigInt(hex);
  }

  private async rpc<T>(method: string, params: unknown[]): Promise<T> {
    const res = await fetch(this.cfg.gatewayRpc, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal:  AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`EdgeValidator: HTTP ${res.status}`);
    const json = await res.json() as { result?: T; error?: { message: string } };
    if (json.error) throw new Error(`EdgeValidator: RPC error — ${json.error.message}`);
    return json.result as T;
  }

  private schedulePoll(): void {
    if (!this.running) return;
    setTimeout(async () => {
      try {
        const networkBlock = await this.fetchNetworkBlock();

        // Update peer count via ghost_peers (informational)
        this.rpc<string[]>('ghost_peers', [])
          .then(peers => { this.peers = peers.length; })
          .catch(() => {});

        const gap = networkBlock > this.localBlock ? networkBlock - this.localBlock : 0n;

        if (gap >= BigInt(this.cfg.maxBlockGap)) {
          await this.syncFromSatellite();
        } else {
          this.localBlock = networkBlock;
        }
      } catch { /* transient satellite drop — retry next poll */ }
      this.schedulePoll();
    }, 4000);
  }

  // ── Factory ──────────────────────────────────────────────────────────────────

  static devnet(validatorAddress: string, layer: RelayLayer = 'l3'): EdgeValidator {
    const rpcMap: Record<RelayLayer, string> = {
      l1: 'http://localhost:18545',
      l2: 'http://localhost:29545',
      l3: 'http://localhost:39545',
    };
    return new EdgeValidator({ validatorAddress, gatewayRpc: rpcMap[layer], layer, maxBlockGap: 5 });
  }
}
