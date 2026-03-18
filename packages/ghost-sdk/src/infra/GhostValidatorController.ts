/**
 * GhostValidatorController — validator node admin interface.
 *
 * Provides structured read-access and soft-control over GhostStack
 * validator / sequencer nodes across L1, L2, and L3.
 *
 * Health and status data are fetched via JSON-RPC — no shell commands.
 * Any restart / reboot of the underlying VMs or containers is delegated
 * to GhostVMController or GhostDockerController (which enforce
 * allowlist + execFile security invariants).
 *
 * Canonical chain IDs:
 *   L1 — GhostChain  (chainId 14000101, port 18545)
 *   L2 — GhostL2     (chainId 901,      port 29547)
 *   L3 — GhostL3     (chainId 903,      port 39545)
 *
 * Usage:
 *   const ctrl = new GhostValidatorController();
 *   const all  = await ctrl.status();          // health of every layer
 *   const hot  = await ctrl.online();          // only healthy validators
 *   const lag  = await ctrl.blockLag("L3");    // head vs. L2 parent
 */

import type { GhostLayer } from "../networks.js";
import { GhostNetworks }   from "../networks.js";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ValidatorNodeConfig {
  /** Human-readable label for this node. */
  name: string;
  /** Layer this node services. */
  layer: GhostLayer;
  /** JSON-RPC endpoint for the node. */
  rpcUrl: string;
}

export interface ValidatorNodeStatus extends ValidatorNodeConfig {
  /** Current head block number, or null if the node is unreachable. */
  blockNumber:  number | null;
  /** Connected peer count, or null if unreachable. */
  peers:        number | null;
  /** True if the node is mid-sync (still catching up). */
  syncing:      boolean | null;
  /** False when the node is unreachable or mid-sync. */
  healthy:      boolean;
  /** ISO-8601 timestamp of this check. */
  checkedAt:    string;
  error?:       string;
}

export interface GhostValidatorControllerConfig {
  /**
   * Validator node definitions.  Defaults to the canonical GhostStack
   * single-node devnet (one node per layer).
   */
  nodes?: ValidatorNodeConfig[];

  /** RPC request timeout in milliseconds. Default: 5 000 ms. */
  timeoutMs?: number;
}

// ── Default devnet nodes ──────────────────────────────────────────────────────

const DEFAULT_NODES: ValidatorNodeConfig[] = [
  { name: "ghostchain-l1",  layer: "L1", rpcUrl: GhostNetworks.L1.rpc },
  { name: "ghostl2-node",   layer: "L2", rpcUrl: GhostNetworks.L2.rpc },
  { name: "ghostl3-node",   layer: "L3", rpcUrl: GhostNetworks.L3.rpc },
];

// ── GhostValidatorController ──────────────────────────────────────────────────

export class GhostValidatorController {
  private readonly _nodes:     ValidatorNodeConfig[];
  private readonly _timeoutMs: number;

  constructor(config: GhostValidatorControllerConfig = {}) {
    this._nodes     = config.nodes ?? DEFAULT_NODES;
    this._timeoutMs = config.timeoutMs ?? 5_000;
  }

  // ── Status queries ─────────────────────────────────────────────────────────

  /** Return health status for every registered validator node. */
  async status(): Promise<ValidatorNodeStatus[]> {
    return Promise.all(this._nodes.map(n => this._check(n)));
  }

  /** Return status for nodes on a specific layer only. */
  async statusForLayer(layer: GhostLayer): Promise<ValidatorNodeStatus[]> {
    return Promise.all(
      this._nodes.filter(n => n.layer === layer).map(n => this._check(n))
    );
  }

  /** Return only nodes that are currently healthy. */
  async online(): Promise<ValidatorNodeStatus[]> {
    const all = await this.status();
    return all.filter(n => n.healthy);
  }

  /** Return only nodes that are currently unhealthy. */
  async offline(): Promise<ValidatorNodeStatus[]> {
    const all = await this.status();
    return all.filter(n => !n.healthy);
  }

  /**
   * Return the approximate block-lag between the target layer and its parent.
   *
   * L3 lag = (L2 head block) − (L3 head block)   [negative means L3 is ahead]
   * L2 lag = (L1 head block) − (L2 head block)
   * L1 lag = 0 (no parent)
   */
  async blockLag(layer: GhostLayer): Promise<number | null> {
    if (layer === "L1") return 0;

    const parentLayer: GhostLayer = layer === "L3" ? "L2" : "L1";
    const [targetNodes, parentNodes] = await Promise.all([
      this.statusForLayer(layer),
      this.statusForLayer(parentLayer),
    ]);

    const targetBlock = targetNodes.find(n => n.healthy && n.blockNumber !== null)?.blockNumber ?? null;
    const parentBlock = parentNodes.find(n => n.healthy && n.blockNumber !== null)?.blockNumber ?? null;

    if (targetBlock === null || parentBlock === null) return null;
    return parentBlock - targetBlock;
  }

  // ── Registration ──────────────────────────────────────────────────────────────

  /** Add a new node to the monitored set. */
  addNode(node: ValidatorNodeConfig): void {
    this._nodes.push(node);
  }

  /** Remove a node by name. */
  removeNode(name: string): boolean {
    const idx = this._nodes.findIndex(n => n.name === name);
    if (idx < 0) return false;
    this._nodes.splice(idx, 1);
    return true;
  }

  /** Return a snapshot of all registered node configs. */
  nodes(): ValidatorNodeConfig[] {
    return this._nodes.map(n => ({ ...n }));
  }

  // ── Internals ─────────────────────────────────────────────────────────────────

  private async _check(node: ValidatorNodeConfig): Promise<ValidatorNodeStatus> {
    const checkedAt = new Date().toISOString();
    try {
      const [block, peers, syncing] = await Promise.all([
        this._rpc<string>(node.rpcUrl, "eth_blockNumber"),
        this._rpc<string>(node.rpcUrl, "net_peerCount"),
        this._rpc<boolean | { startingBlock: string }>(node.rpcUrl, "eth_syncing"),
      ]);

      const blockNumber = block  ? parseInt(block, 16)  : null;
      const peerCount   = peers  ? parseInt(peers, 16)  : null;
      const isSyncing   =
        syncing === true  ? true
        : syncing === false ? false
        : typeof syncing === "object" && syncing !== null;

      const healthy = blockNumber !== null && peerCount !== null && !isSyncing;

      return { ...node, blockNumber, peers: peerCount, syncing: isSyncing, healthy, checkedAt };
    } catch (err) {
      return {
        ...node,
        blockNumber: null,
        peers:       null,
        syncing:     null,
        healthy:     false,
        error: err instanceof Error ? err.message : String(err),
        checkedAt,
      };
    }
  }

  private async _rpc<T>(url: string, method: string): Promise<T> {
    const controller = new AbortController();
    const timer      = setTimeout(() => controller.abort(), this._timeoutMs);
    try {
      const res = await fetch(url, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: [] }),
        signal: controller.signal,
      });
      const data = await res.json() as { result?: T; error?: { message: string } };
      if (data.error) throw new Error(data.error.message);
      return data.result as T;
    } finally {
      clearTimeout(timer);
    }
  }
}
