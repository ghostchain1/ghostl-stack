/**
 * @file rpc/GhostRPCMethod.ts
 * @module @ghostchain/ghost-nodes/rpc
 *
 * Ghost-branded JSON-RPC method constants.
 *
 * Architecture:
 *   Public API surface → Ghost-branded method names (ghost_*)
 *   Wire protocol      → Standard EVM JSON-RPC method names (eth_*, optimism_*)
 *
 * Consumers of this module ONLY see Ghost-branded identifiers.
 * The eth_* wire names are internal to GhostRPCClient and never
 * exported on the public TypeScript surface of @ghostchain/ghost-nodes.
 *
 * Brand law compliance:
 *   - No file outside packages/ghost-nodes/src/rpc/ or the compat layer
 *     should import eth_* string literals.
 *   - External consumers write: GhostRPCMethod.getBalance (ghost_getBalance)
 *   - Ghost-sdk-core handles the wire mapping transparently.
 */

// ─── Public Ghost-branded method constants ────────────────────────────────────

/**
 * GhostRPCMethod — public Ghost-branded constants for all supported RPC methods.
 *
 * Use these constants instead of raw `eth_*` or `optimism_*` strings.
 * The eth_*→wire translation is handled internally by GhostRPCClient.
 *
 * @example
 *   const bn = await client.call(GhostRPCMethod.getBlockNumber, []);
 */
export const GhostRPCMethod = Object.freeze({
  // ── Chain state ───────────────────────────────────────────────────────────
  getBlockNumber:            "ghost_blockNumber",
  getChainId:                "ghost_chainId",
  getBalance:                "ghost_getBalance",
  getTransactionCount:       "ghost_getTransactionCount",
  getCode:                   "ghost_getCode",
  getStorageAt:              "ghost_getStorageAt",

  // ── Transaction execution ─────────────────────────────────────────────────
  call:                      "ghost_call",
  estimateGas:               "ghost_estimateGas",
  sendRawTransaction:        "ghost_sendRawTransaction",
  signTransaction:           "ghost_signTransaction",

  // ── Gas / fees ────────────────────────────────────────────────────────────
  getGasPrice:               "ghost_gasPrice",
  getFeeHistory:             "ghost_feeHistory",
  getMaxPriorityFeePerGas:   "ghost_maxPriorityFeePerGas",

  // ── Blocks ────────────────────────────────────────────────────────────────
  getBlockByNumber:          "ghost_getBlockByNumber",
  getBlockByHash:            "ghost_getBlockByHash",

  // ── Transactions ──────────────────────────────────────────────────────────
  getTransactionByHash:      "ghost_getTransactionByHash",
  getTransactionReceipt:     "ghost_getTransactionReceipt",
  getTransactionByBlockAndIndex: "ghost_getTransactionByBlockNumberAndIndex",

  // ── Logs / filters ────────────────────────────────────────────────────────
  getLogs:                   "ghost_getLogs",
  newFilter:                 "ghost_newFilter",
  newBlockFilter:            "ghost_newBlockFilter",
  getFilterLogs:             "ghost_getFilterLogs",
  getFilterChanges:          "ghost_getFilterChanges",
  uninstallFilter:           "ghost_uninstallFilter",

  // ── Subscriptions ─────────────────────────────────────────────────────────
  subscribe:                 "ghost_subscribe",
  unsubscribe:               "ghost_unsubscribe",

  // ── Network ───────────────────────────────────────────────────────────────
  getPeerCount:              "ghost_peerCount",
  isListening:               "ghost_listening",
  getNetworkVersion:         "ghost_version",
  isSyncing:                 "ghost_syncing",
  getClientVersion:          "ghost_clientVersion",

  // ── OP Stack (L2/L3) ─────────────────────────────────────────────────────
  getSyncStatus:             "ghost_syncStatus",
  getOutputAtBlock:          "ghost_outputAtBlock",
  getRollupConfig:           "ghost_rollupConfig",
  getSafeHeadAtL1Block:      "ghost_safeHeadAtL1Block",

  // ── L1 validator set ──────────────────────────────────────────────────────
  getValidators:             "ghost_getValidators",
  getSnapshot:               "ghost_getSnapshot",

  // ── Debug ─────────────────────────────────────────────────────────────────
  traceTransaction:          "ghost_traceTransaction",
  traceBlock:                "ghost_traceBlock",
  storageRangeAt:            "ghost_storageRangeAt",
} as const);

export type GhostRPCMethodName = typeof GhostRPCMethod[keyof typeof GhostRPCMethod];
