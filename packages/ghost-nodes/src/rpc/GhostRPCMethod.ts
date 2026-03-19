/**
 * @file rpc/GhostRPCMethod.ts
 * @module @ghostchain/ghost-nodes/rpc
 *
 * Ghost-branded JSON-RPC method constants.
 *
 * Architecture:
 *   Public API surface        → Ghost-branded runtime method names (ghost_*)
 *   Compat RPC surface        → Ghost-branded compatibility names (ghost_compat_*)
 *   Legacy compat aliases     → Ghost-branded deprecated rollup names (ghost_*)
 *                                isolated to @ghostchain/ghost-nodes/compat
 *   Wire protocol             → Standard EVM JSON-RPC method names (eth_*, optimism_*)
 *
 * Consumers of this module ONLY see Ghost-branded identifiers.
 * The eth_* wire names are internal to GhostRPCClient and never
 * exported on the public TypeScript surface of @ghostchain/ghost-nodes.
 *
 * Brand law compliance:
 *   - No file outside packages/ghost-nodes/src/rpc/ or the compat layer
 *     should import eth_* string literals.
 *   - External consumers write: GhostRPCMethod.getBalance (ghost_getBalance)
 *   - Rollup-compat telemetry must use GhostRPCCompatMethod rather than
 *     masquerading as the canonical Ghost runtime surface.
 *   - Deprecated rollup aliases remain available only through the compat
 *     subpath so the root export surface stays honest.
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

  // ── L1 validator set ──────────────────────────────────────────────────────
  getValidators:             "ghost_getValidators",
  getSnapshot:               "ghost_getSnapshot",

  // ── Debug ─────────────────────────────────────────────────────────────────
  traceTransaction:          "ghost_traceTransaction",
  traceBlock:                "ghost_traceBlock",
  storageRangeAt:            "ghost_storageRangeAt",
} as const);

export type GhostRPCMethodName = typeof GhostRPCMethod[keyof typeof GhostRPCMethod];

/**
 * GhostRPCCompatMethod — explicit compatibility-only rollup telemetry methods.
 *
 * These names exist so OP-era L2/L3 rollup RPC behavior can be called through
 * a clearly-marked compatibility boundary while the Ghost-native runtime is
 * being built out.
 */
export const GhostRPCCompatMethod = Object.freeze({
  getSyncStatus:        "ghost_compat_syncStatus",
  getOutputAtBlock:     "ghost_compat_outputAtBlock",
  getRollupConfig:      "ghost_compat_rollupConfig",
  getSafeHeadAtL1Block: "ghost_compat_safeHeadAtL1Block",
} as const);

export type GhostRPCCompatMethodName =
  typeof GhostRPCCompatMethod[keyof typeof GhostRPCCompatMethod];

/**
 * GhostRPCLegacyRollupMethod — deprecated pre-compat rollup aliases.
 *
 * These names are intentionally NOT exported from the package root.
 * Only import them from `@ghostchain/ghost-nodes/compat` when bridging older
 * consumers that have not yet migrated to `GhostRPCCompatMethod`.
 */
export const GhostRPCLegacyRollupMethod = Object.freeze({
  getSyncStatus:        "ghost_syncStatus",
  getOutputAtBlock:     "ghost_outputAtBlock",
  getRollupConfig:      "ghost_rollupConfig",
  getSafeHeadAtL1Block: "ghost_safeHeadAtL1Block",
} as const);

export type GhostRPCLegacyRollupMethodName =
  typeof GhostRPCLegacyRollupMethod[keyof typeof GhostRPCLegacyRollupMethod];
