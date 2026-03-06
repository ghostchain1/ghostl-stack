/**
 * @file types.ts
 * @module @ghostchain/ghost-nodes
 *
 * Canonical Ghost-branded type definitions for the node connectivity layer.
 * No GhostChain/ghost-sdk type names appear on the public surface of this module. // brand-enforcer-ignore
 *
 * Naming convention:
 *   - All types are prefixed "Ghost" or live in a Ghost namespace.
 *   - Wire-level JSON-RPC uses standard EVM method names internally;
 *     the public TypeScript API exposes only Ghost-branded method identifiers.
 */

// ─── Chain layer ordinals ─────────────────────────────────────────────────────

/** GhostChain network layer. */
export enum GhostNodeLayer {
  L1 = 1,
  L2 = 2,
  L3 = 3,
}

// ─── Node roles ───────────────────────────────────────────────────────────────

/** Functional role of a GhostChain node. */
export enum GhostNodeRole {
  /** IBFT validator (L1) or sequencer (L2/L3). */
  Validator  = "validator",
  Sequencer  = "sequencer",
  /** P2P discovery seed. */
  Bootnode   = "bootnode",
  /** Read-only JSON-RPC endpoint. */
  RPC        = "rpc",
  /** Batch-poster to parent chain. */
  Batcher    = "batcher",
  /** Output-root proposer to parent chain. */
  Proposer   = "proposer",
}

// ─── Node health ──────────────────────────────────────────────────────────────

export enum GhostNodeStatus {
  /** Responding to health checks. */
  Healthy   = "healthy",
  /** Elevated block lag or slow responses. */
  Degraded  = "degraded",
  /** Not reachable via RPC. */
  Unreachable = "unreachable",
  /** Status not yet determined. */
  Unknown   = "unknown",
}

export interface GhostNodeHealthSnapshot {
  /** Millisecond timestamp of this snapshot. */
  ts: number;
  status: GhostNodeStatus;
  /** Current block number reported by the node (or null on failure). */
  blockNumber: bigint | null;
  /** Round-trip latency for the health call in milliseconds. */
  latencyMs: number;
  /** Optional error message when status is Degraded/Unreachable. */
  error?: string;
}

// ─── Node configuration ───────────────────────────────────────────────────────

export interface GhostNodeConfig {
  /** Stable short name, e.g. "ghost-ghostchain-node1-1". */
  name: string;
  /** GhostChain network layer this node belongs to. */
  layer: GhostNodeLayer;
  /** Functional role. */
  role: GhostNodeRole;
  /** Primary JSON-RPC endpoint. */
  rpcUrl: string;
  /** Fallback JSON-RPC endpoints tried in order when primary fails. */
  fallbackRpcUrls?: string[];
  /** Engine/auth-RPC endpoint (validators / sequencers). */
  authRpcUrl?: string;
  /** WebSocket RPC endpoint for subscriptions. */
  wsRpcUrl?: string;
  /** VM management IP (KVM gs-mgmt network). */
  managementIp?: string;
  /** EVM chain ID serviced by this node. */
  chainId: number;
  /** Whether this node is part of the mainnet (true) or testnet/devnet (false). */
  isMainnet: boolean;
  /** Maximum tolerable block lag before the node is marked Degraded. */
  maxBlockLagSeconds?: number;
}

// ─── RPC request / response ───────────────────────────────────────────────────

export interface GhostRPCRequest {
  /** Ghost-branded method identifier, e.g. "ghost_getBalance". */
  ghostMethod: string;
  /** Wire-level EVM JSON-RPC method, e.g. "eth_getBalance". */
  wireMethod: string;
  params: unknown[];
  id: number;
}

export interface GhostRPCResponse<T = unknown> {
  result: T;
  /** Ghost-branded method that produced this response. */
  ghostMethod: string;
  /** Round-trip latency in milliseconds. */
  latencyMs: number;
}

// ─── Node pool ────────────────────────────────────────────────────────────────

export interface GhostNodePoolConfig {
  /** Strategy for picking a node when multiple are healthy. */
  strategy: "round-robin" | "random" | "lowest-latency";
  /** How often to run background health checks (ms). 0 = on-demand only. */
  healthCheckIntervalMs: number;
  /** Tolerated consecutive failures before a node is evicted from rotation. */
  maxConsecutiveFailures: number;
}

// ─── Fleet node definitions ───────────────────────────────────────────────────

/** A complete Ghost node descriptor with all connectivity metadata. */
export interface GhostFleetNode extends GhostNodeConfig {
  /** Human-readable display name, e.g. "GhostChain L1 Mainnet Node 1". */
  displayName: string;
  /** Block explorer URL for this layer. */
  explorerUrl?: string;
}
