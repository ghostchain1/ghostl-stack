/**
 * @file GhostNode.ts
 * @module @ghostchain/ghost-nodes
 *
 * GhostNode — the canonical Ghost-branded node representation.
 *
 * Provides typed L1/L2/L3 node classes with real fleet data sourced
 * from infra/hypervisor/provision/inventory.sh.
 *
 * Design principle:
 *   - Zero "GhostChain" / "ETH" / "ether" identifiers on the public API. // brand-enforcer-ignore — listing forbidden terms
 *   - Wire protocol (JSON-RPC over HTTP) uses standard EVM method names
 *     internally; all public TypeScript methods use Ghost naming.
 */

import {
  GhostNodeLayer,
  GhostNodeRole,
  GhostNodeStatus,
  type GhostNodeConfig,
  type GhostNodeHealthSnapshot,
  type GhostFleetNode,
} from "./types.js";

import { GhostRPCClient } from "./rpc/GhostRPCClient.js";

// ─── Base GhostNode ───────────────────────────────────────────────────────────

/**
 * Base class for all GhostChain network nodes.
 * Wraps a GhostRPCClient and exposes Ghost-branded query methods.
 */
export class GhostNode {
  protected readonly _cfg: GhostNodeConfig;
  protected readonly _rpc: GhostRPCClient;

  /** Latest known health snapshot (updated by health checks). */
  protected _health: GhostNodeHealthSnapshot = {
    ts: 0,
    status: GhostNodeStatus.Unknown,
    blockNumber: null,
    latencyMs: 0,
  };

  constructor(config: GhostNodeConfig) {
    this._cfg = config;
    this._rpc = new GhostRPCClient(config.rpcUrl, config.fallbackRpcUrls ?? []);
  }

  // ─── Identity ──────────────────────────────────────────────────────────────

  get name():      string          { return this._cfg.name; }
  get layer():     GhostNodeLayer  { return this._cfg.layer; }
  get role():      GhostNodeRole   { return this._cfg.role; }
  get chainId():   number          { return this._cfg.chainId; }
  get rpcUrl():    string          { return this._cfg.rpcUrl; }
  get isMainnet(): boolean         { return this._cfg.isMainnet; }
  /** Full configuration object. */
  get config():    GhostNodeConfig { return this._cfg; }

  // ─── Chain queries (Ghost-branded names) ───────────────────────────────────

  /** Returns the current GhostChain block number. */
  async getGhostBlockNumber(): Promise<bigint> {
    const hex = await this._rpc.call<string>("ghost_blockNumber", []);
    return BigInt(hex);
  }

  /** Returns the GST balance (in GhostWei) for the given address. */
  async getGhostBalance(address: string, tag: "latest" | "earliest" | "pending" = "latest"): Promise<bigint> {
    const hex = await this._rpc.call<string>("ghost_getBalance", [address, tag]);
    return BigInt(hex);
  }

  /** Returns the GhostChain ID. */
  async getGhostChainId(): Promise<number> {
    const hex = await this._rpc.call<string>("ghost_chainId", []);
    return Number(BigInt(hex));
  }

  /** Returns the nonce for the given address. */
  async getGhostNonce(address: string, tag: "latest" | "pending" = "latest"): Promise<number> {
    const hex = await this._rpc.call<string>("ghost_getTransactionCount", [address, tag]);
    return Number(BigInt(hex));
  }

  /** Returns the bytecode at the given address. */
  async getGhostCode(address: string, tag = "latest"): Promise<string> {
    return this._rpc.call<string>("ghost_getCode", [address, tag]);
  }

  /** Estimates the GST gas cost for a transaction. */
  async estimateGhostGas(tx: Record<string, unknown>): Promise<bigint> {
    const hex = await this._rpc.call<string>("ghost_estimateGas", [tx]);
    return BigInt(hex);
  }

  /** Returns the current GhostChain fee data (max fee, priority fee, gas price). */
  async getGhostFeeData(): Promise<{ gasPrice: bigint; maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }> {
    const [gasPrice, feeHistory] = await Promise.all([
      this._rpc.call<string>("ghost_gasPrice", []),
      this._rpc.call<{ reward?: string[][]; baseFeePerGas?: string[] }>(
        "ghost_feeHistory", [1, "latest", [50]]
      ),
    ]);
    const base = BigInt(feeHistory.baseFeePerGas?.[0] ?? "0x0");
    const tip  = BigInt(feeHistory.reward?.[0]?.[0] ?? "0x0");
    return {
      gasPrice:            BigInt(gasPrice),
      maxFeePerGas:        base * 2n + tip,
      maxPriorityFeePerGas: tip,
    };
  }

  /** Sends a raw signed GST transaction. Returns the ghost transaction hash. */
  async sendGhostRawTransaction(signedTxHex: string): Promise<string> {
    return this._rpc.call<string>("ghost_sendRawTransaction", [signedTxHex]);
  }

  /** Returns the block at the given number or tag. */
  async getGhostBlock(blockTag: string | number, includeTransactions = false): Promise<Record<string, unknown> | null> {
    const tag = typeof blockTag === "number" ? `0x${blockTag.toString(16)}` : blockTag;
    return this._rpc.call<Record<string, unknown> | null>("ghost_getBlockByNumber", [tag, includeTransactions]);
  }

  /** Returns the transaction receipt for the given ghost transaction hash. */
  async getGhostTransactionReceipt(hash: string): Promise<Record<string, unknown> | null> {
    return this._rpc.call<Record<string, unknown> | null>("ghost_getTransactionReceipt", [hash]);
  }

  /** Calls a view function on-chain. */
  async ghostCall(tx: Record<string, unknown>, tag = "latest"): Promise<string> {
    return this._rpc.call<string>("ghost_call", [tx, tag]);
  }

  // ─── Health ────────────────────────────────────────────────────────────────

  /** Returns the latest cached health snapshot. */
  get health(): GhostNodeHealthSnapshot { return { ...this._health }; }

  /**
   * Runs a live health check against this node.
   * Updates the internal snapshot and returns the result.
   */
  async checkHealth(): Promise<GhostNodeHealthSnapshot> {
    const start = Date.now();
    try {
      const blockNumber = await this.getGhostBlockNumber();
      const latencyMs   = Date.now() - start;
      const maxLag      = this._cfg.maxBlockLagSeconds ?? 60;
      // If block is zero and this is mainnet, flag as degraded
      const isDegraded  = this.isMainnet && blockNumber === 0n;
      this._health = {
        ts:          Date.now(),
        status:      isDegraded ? GhostNodeStatus.Degraded : GhostNodeStatus.Healthy,
        blockNumber,
        latencyMs,
      };
    } catch (err) {
      this._health = {
        ts:          Date.now(),
        status:      GhostNodeStatus.Unreachable,
        blockNumber: null,
        latencyMs:   Date.now() - start,
        error:       err instanceof Error ? err.message : String(err),
      };
    }
    return { ...this._health };
  }

  /** Returns true if this node is healthy or only mildly degraded. */
  isOperational(): boolean {
    return (
      this._health.status === GhostNodeStatus.Healthy ||
      this._health.status === GhostNodeStatus.Degraded
    );
  }

  /** Human-readable summary. */
  toString(): string {
    return `GhostNode(${this.name} | L${this.layer} | ${this.role} | ${this.rpcUrl})`;
  }
}

// ─── Typed layer nodes ────────────────────────────────────────────────────────

/**
 * GhostL1Node — a node on GhostChain L1 (chainId 14000101).
 * L1 nodes run IBFT consensus and hold the canonical GST ledger.
 */
export class GhostL1Node extends GhostNode {
  static readonly CHAIN_ID   = 14000101;
  static readonly CHAIN_NAME = "GhostChain L1";
  static readonly LAYER      = GhostNodeLayer.L1;

  constructor(config: Omit<GhostNodeConfig, "layer" | "chainId"> & { chainId?: number }) {
    super({ ...config, layer: GhostNodeLayer.L1, chainId: config.chainId ?? GhostL1Node.CHAIN_ID });
  }

  /** Returns the IBFT validator set for the current block. */
  async getGhostValidatorSet(blockTag = "latest"): Promise<string[]> {
    return this._rpc.call<string[]>("ghost_getValidators", [blockTag]);
  }
}

/**
 * GhostL2Node — a node on GhostL2 (chainId 901, OP Stack settling to L1).
 * L2 nodes run the op-node sequencer and l2-geth execution engine.
 */
export class GhostL2Node extends GhostNode {
  static readonly CHAIN_ID   = 901;
  static readonly CHAIN_NAME = "GhostL2";
  static readonly LAYER      = GhostNodeLayer.L2;

  constructor(config: Omit<GhostNodeConfig, "layer" | "chainId"> & { chainId?: number }) {
    super({ ...config, layer: GhostNodeLayer.L2, chainId: config.chainId ?? GhostL2Node.CHAIN_ID });
  }

  /** Returns the L2 output root at the given index. */
  async getGhostOutputRoot(outputIndex: bigint): Promise<string> {
    return this._rpc.call<string>("ghost_outputAtBlock", [
      `0x${outputIndex.toString(16)}`
    ]);
  }

  /** Returns the sync status of the L2 sequencer. */
  async getGhostSyncStatus(): Promise<Record<string, unknown>> {
    return this._rpc.call<Record<string, unknown>>("ghost_syncStatus", []);
  }
}

/**
 * GhostL3Node — a node on GhostL3 (chainId 903, OP Stack settling to L2).
 * L3 nodes run application-layer transactions and batch to GhostL2.
 */
export class GhostL3Node extends GhostNode {
  static readonly CHAIN_ID   = 903;
  static readonly CHAIN_NAME = "GhostL3";
  static readonly LAYER      = GhostNodeLayer.L3;

  constructor(config: Omit<GhostNodeConfig, "layer" | "chainId"> & { chainId?: number }) {
    super({ ...config, layer: GhostNodeLayer.L3, chainId: config.chainId ?? GhostL3Node.CHAIN_ID });
  }

  /** Returns the L3 sync status. */
  async getGhostSyncStatus(): Promise<Record<string, unknown>> {
    return this._rpc.call<Record<string, unknown>>("ghost_syncStatus", []);
  }
}

// ─── Canonical fleet ──────────────────────────────────────────────────────────

/**
 * GHOST_FLEET — canonical GhostChain node fleet definitions.
 *
 * IPs sourced from infra/hypervisor/provision/inventory.sh.
 * Topology matches ALL_VMS boot-order array.
 *
 * Use GhostNodeFactory.fromFleet() to instantiate typed GhostNode objects.
 */
export const GHOST_FLEET: readonly GhostFleetNode[] = Object.freeze([
  // ── GhostChain L1 ────────────────────────────────────────────────────────
  {
    name:        "ghost-ghostchain-bootnode-1",
    displayName: "GhostChain L1 Bootnode",
    layer:       GhostNodeLayer.L1,
    role:        GhostNodeRole.Bootnode,
    chainId:     GhostL1Node.CHAIN_ID,
    rpcUrl:      "http://10.50.99.20:18545",
    managementIp: "10.50.99.20",
    isMainnet:   false,
  },
  {
    name:        "ghost-ghostchain-node1-1",
    displayName: "GhostChain L1 Validator Node 1",
    layer:       GhostNodeLayer.L1,
    role:        GhostNodeRole.Validator,
    chainId:     GhostL1Node.CHAIN_ID,
    rpcUrl:      "http://10.50.99.21:18545",
    authRpcUrl:  "http://10.50.99.21:18551",
    managementIp: "10.50.99.21",
    isMainnet:   false,
  },
  {
    name:        "ghost-ghostchain-node2-1",
    displayName: "GhostChain L1 Validator Node 2",
    layer:       GhostNodeLayer.L1,
    role:        GhostNodeRole.Validator,
    chainId:     GhostL1Node.CHAIN_ID,
    rpcUrl:      "http://10.50.99.22:18545",
    authRpcUrl:  "http://10.50.99.22:18551",
    managementIp: "10.50.99.22",
    isMainnet:   false,
  },
  // ── Mainnet L1 ────────────────────────────────────────────────────────────
  {
    name:        "ghostchain-mainnet-l1",
    displayName: "GhostChain Mainnet L1",
    layer:       GhostNodeLayer.L1,
    role:        GhostNodeRole.Validator,
    chainId:     GhostL1Node.CHAIN_ID,
    rpcUrl:      "http://10.50.99.70:18545",
    authRpcUrl:  "http://10.50.99.70:18551",
    managementIp: "10.50.99.70",
    isMainnet:   true,
    explorerUrl: "http://10.50.99.10:3001",
  },
  {
    name:        "ghost-mainnet-validator",
    displayName: "GhostChain Mainnet Validator",
    layer:       GhostNodeLayer.L1,
    role:        GhostNodeRole.Validator,
    chainId:     GhostL1Node.CHAIN_ID,
    rpcUrl:      "http://10.50.99.72:18545",
    authRpcUrl:  "http://10.50.99.72:18551",
    managementIp: "10.50.99.72",
    isMainnet:   true,
  },
  // ── Testnet L1 ────────────────────────────────────────────────────────────
  {
    name:        "ghostchain-testnet-l1",
    displayName: "GhostChain Testnet L1",
    layer:       GhostNodeLayer.L1,
    role:        GhostNodeRole.Validator,
    chainId:     GhostL1Node.CHAIN_ID,
    rpcUrl:      "http://10.50.99.71:18545",
    managementIp: "10.50.99.71",
    isMainnet:   false,
  },
  // ── GhostL2 mainnet ───────────────────────────────────────────────────────
  {
    name:        "ghostl2-mainnet",
    displayName: "GhostL2 Mainnet Sequencer",
    layer:       GhostNodeLayer.L2,
    role:        GhostNodeRole.Sequencer,
    chainId:     GhostL2Node.CHAIN_ID,
    rpcUrl:      "http://10.50.99.76:29547",
    wsRpcUrl:    "ws://10.50.99.76:29546",
    managementIp: "10.50.99.76",
    isMainnet:   true,
    explorerUrl: "http://10.50.99.10:3002",
  },
  // ── GhostL2 testnet ───────────────────────────────────────────────────────
  {
    name:        "ghostl2-testnet",
    displayName: "GhostL2 Testnet Sequencer",
    layer:       GhostNodeLayer.L2,
    role:        GhostNodeRole.Sequencer,
    chainId:     GhostL2Node.CHAIN_ID,
    rpcUrl:      "http://10.50.99.77:29547",
    managementIp: "10.50.99.77",
    isMainnet:   false,
  },
  // ── GhostL3 mainnet ───────────────────────────────────────────────────────
  {
    name:        "ghostl3-mainnet",
    displayName: "GhostL3 Mainnet Sequencer",
    layer:       GhostNodeLayer.L3,
    role:        GhostNodeRole.Sequencer,
    chainId:     GhostL3Node.CHAIN_ID,
    rpcUrl:      "http://10.50.99.78:39545",
    wsRpcUrl:    "ws://10.50.99.78:39546",
    managementIp: "10.50.99.78",
    isMainnet:   true,
    explorerUrl: "http://10.50.99.10:3003",
  },
  // ── GhostL3 testnet ───────────────────────────────────────────────────────
  {
    name:        "ghostl3-testnet",
    displayName: "GhostL3 Testnet Sequencer",
    layer:       GhostNodeLayer.L3,
    role:        GhostNodeRole.Sequencer,
    chainId:     GhostL3Node.CHAIN_ID,
    rpcUrl:      "http://10.50.99.79:39545",
    managementIp: "10.50.99.79",
    isMainnet:   false,
  },
]);

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * GhostNodeFactory — constructs typed GhostNode instances from config or fleet.
 */
export class GhostNodeFactory {
  /** Create a typed GhostNode from an arbitrary config. */
  static create(config: GhostNodeConfig): GhostNode {
    switch (config.layer) {
      case GhostNodeLayer.L1: return new GhostL1Node(config);
      case GhostNodeLayer.L2: return new GhostL2Node(config);
      case GhostNodeLayer.L3: return new GhostL3Node(config);
      default:                return new GhostNode(config);
    }
  }

  /**
   * Instantiate all nodes from the canonical GHOST_FLEET.
   * @param filter Optional predicate to select a sub-fleet.
   */
  static fromFleet(filter?: (n: GhostFleetNode) => boolean): GhostNode[] {
    const selected = filter ? GHOST_FLEET.filter(filter) : GHOST_FLEET;
    return selected.map((n) => GhostNodeFactory.create(n));
  }

  /**
   * Get mainnet nodes for the specified layer.
   * @example
   *   const l2Nodes = GhostNodeFactory.mainnet(GhostNodeLayer.L2);
   */
  static mainnet(layer: GhostNodeLayer): GhostNode[] {
    return GhostNodeFactory.fromFleet((n) => n.layer === layer && n.isMainnet);
  }

  /**
   * Get testnet nodes for the specified layer.
   */
  static testnet(layer: GhostNodeLayer): GhostNode[] {
    return GhostNodeFactory.fromFleet((n) => n.layer === layer && !n.isMainnet);
  }

  /** Get a single node by fleet name. */
  static byName(name: string): GhostNode | undefined {
    const cfg = GHOST_FLEET.find((n) => n.name === name);
    return cfg ? GhostNodeFactory.create(cfg) : undefined;
  }
}
