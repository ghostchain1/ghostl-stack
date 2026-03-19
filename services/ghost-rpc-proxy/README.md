# ghost-rpc-proxy

`ghost-rpc-proxy` is a JSON-RPC proxy that sits in front of an upstream execution or rollup RPC endpoint.

## Ghost Namespaces

GhostChain exposes `ghost_*` methods as the canonical public namespace.

- Execution RPC compatibility: `gst_*` and `eth_*` still work as aliases for execution methods.
- Rollup RPC compatibility: `ghost_compat_*` is the explicit compatibility surface for OP-era rollup methods, and the proxy rewrites those calls to upstream `optimism_*`.
- Legacy rollup aliases: `ghost_syncStatus` and raw `optimism_*` are still accepted as aliases and are canonicalized to `ghost_compat_*` at the proxy edge.
- Observability: when a legacy alias is used, the proxy emits `rpc_alias_used` events and metrics (opt-in audit sink supported).

### Controls (env vars)

- `RPC_ENABLE_GST_NAMESPACE=1` (default): enable execution-namespace remaps and alias logging
- `RPC_DEPRECATE_LEGACY_NAMESPACE=1`: set `x-ghost-rpc-warning` header on requests that include legacy `eth_*` methods (alias supported for backward compatibility)
- `RPC_REJECT_LEGACY_NAMESPACE=1`: hard-reject legacy `eth_*` aliases when a canonical `ghost_*` method exists (do **not** enable until all internal callers migrated)

## Supported canonical remaps

The proxy currently canonicalizes (non-exhaustive):

- `eth_blockNumber` → `ghost_blockNumber`
- `eth_chainId` → `ghost_chainId`
- `eth_getBalance` → `ghost_getBalance`
- `eth_call` → `ghost_call`
- `eth_estimateGas` → `ghost_estimateGas`
- `eth_gasPrice` → `ghost_gasPrice`
- `eth_feeHistory` → `ghost_feeHistory`
- `ghost_compat_syncStatus` → `optimism_syncStatus`
- `ghost_compat_outputAtBlock` → `optimism_outputAtBlock`
- `ghost_compat_rollupConfig` → `optimism_rollupConfig`
- `ghost_compat_safeHeadAtL1Block` → `optimism_safeHeadAtL1Block`

If you need additional `ghost_*` or `ghost_compat_*` coverage, extend the maps in `services/ghost-rpc-proxy/index.mjs`.
