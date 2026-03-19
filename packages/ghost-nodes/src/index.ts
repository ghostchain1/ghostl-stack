/**
 * @file index.ts
 * @module @ghostchain/ghost-nodes
 *
 * GhostStack Branded Nodes Module — main export.
 *
 * Every symbol in this package is Ghost-branded.
 * No "GhostChain", "ethers", "ETH", "ether", "parseEther", "formatEther", // brand-enforcer-ignore — listing forbidden terms
 * "eth_" string literals, or "window.ethereum" references appear on the
 * public API surface.
 *
 * - Node types:     GhostNode, GhostL1Node, GhostL2Node, GhostL3Node
 * - Fleet data:     GHOST_FLEET, GhostNodeFactory
 * - Connection:     GhostNodePool, GhostRPCClient
 * - Discovery:      GhostNodeRegistry
 * - Health:         GhostNodeHealthMonitor
 * - RPC constants:  GhostRPCMethod + GhostRPCCompatMethod
 * - Compat aliases: @ghostchain/ghost-nodes/compat (ethers types and deprecated rollup aliases under Ghost names) // brand-enforcer-ignore
 */

// ─── Core types ───────────────────────────────────────────────────────────────
export * from "./types.js";

// ─── Node classes + fleet ─────────────────────────────────────────────────────
export * from "./GhostNode.js";

// ─── Connection pool ──────────────────────────────────────────────────────────
export { GhostNodePool }    from "./GhostNodePool.js";
export type { SelectionStrategy } from "./GhostNodePool.js";

// ─── Registry client ──────────────────────────────────────────────────────────
export { GhostNodeRegistry } from "./GhostNodeRegistry.js";

// ─── Health monitor ───────────────────────────────────────────────────────────
export { GhostNodeHealthMonitor } from "./GhostNodeHealth.js";
export type {
  GhostHealthAlert,
  GhostHealthAlertSeverity,
  GhostHealthAlertHandler,
  GhostNodeHealthConfig,
} from "./GhostNodeHealth.js";

// ─── RPC ──────────────────────────────────────────────────────────────────────
export {
  GhostRPCMethod,
  GhostRPCCompatMethod,
  GhostRPCMethodName,
  GhostRPCCompatMethodName,
} from "./rpc/GhostRPCMethod.js";

export {
  GhostRPCClient,
  GhostRPCError,
} from "./rpc/GhostRPCClient.js";

// Note: compat aliases are exported from @ghostchain/ghost-nodes/compat (sub-path)
