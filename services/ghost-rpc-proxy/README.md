# ghost-rpc-proxy

`ghost-rpc-proxy` is a JSON-RPC proxy that sits in front of an upstream execution client (e.g., geth/op-geth).

## gst_* namespace (canonical)

GhostChain exposes `gst_*` methods as the **canonical** namespace.

- External compatibility: `eth_*` still works.
- Upstream client compatibility: upstream only implements `eth_*` today, so the proxy rewrites `gst_*` → `eth_*` when forwarding upstream.
- Observability: when `eth_*` is used and a `gst_*` canonical method exists, the proxy emits `rpc_alias_used` events and metrics (opt-in audit sink supported).

### Controls (env vars)

- `RPC_ENABLE_GST_NAMESPACE=1` (default): enable namespace remaps and alias logging
- `RPC_DEPRECATE_ETH_NAMESPACE=1`: set `x-ghost-rpc-warning` header on requests that include `eth_*`
- `RPC_REJECT_ETH_NAMESPACE=1`: hard-reject `eth_*` aliases when a canonical `gst_*` exists (do **not** enable until all internal callers migrated)

## Supported canonical remaps

The proxy currently canonicalizes (non-exhaustive):

- `eth_blockNumber` → `gst_blockNumber`
- `eth_chainId` → `gst_chainId`
- `eth_getBalance` → `gst_getBalance`
- `eth_call` → `gst_call`
- `eth_estimateGas` → `gst_estimateGas`
- `eth_gasPrice` → `gst_gasPrice`
- `eth_feeHistory` → `gst_feeHistory`

If you need additional `gst_*` coverage, extend the maps in `services/ghost-rpc-proxy/index.mjs`.

