# Rename Map (ETH → GST) — Phase 1 output

Captured at: `2026-02-06T05:48:28Z`
Revision: `e5a0fbcb1973212cb183ba1fd4f725fd8215a3c9`

This file is the working map for Phase 2 (systemic rebrand). It intentionally separates:

- **Business/branding semantics** (must become GST-native)
- **Technical compatibility** (`eth_*` JSON-RPC methods, module name `eth`, EVM units) that may remain, but must not leak into product branding or public config knobs.

## Global rules

1. Replace user-facing strings:
   - `ETH` / `Ether` / `Ethereum` / `Ξ` → `GST` / `GhostChain` (or “parent chain”, “external chain” where appropriate)
2. Replace identifiers and config keys (preferred):
   - `_eth` → `_gst`
   - `ETH_` → `GST_`
   - `amountEth` / `ethBalance` / `nativeEth` → `amountGst` / `gstBalance` / `nativeGst`
3. Keep JSON-RPC compatibility as **allowlisted technical tokens**:
   - `eth_*` methods, module `eth`, and `wei` **may remain** internally.
   - Do **not** expose `eth` as a first-class “currency name” in UI, docs, or env keys.

## Concrete renames (from inventory)

### Apps / Governance UI

| Current | Proposed | Notes |
|---|---|---|
| `ghostldao.eth` (Snapshot space default) | `ghostldao.gst` (or non-ENS space) | Requires confirming Snapshot space naming constraints. If `.eth` is mandatory upstream, use a neutral default and require explicit override. |

### Services

| Current | Proposed | Notes |
|---|---|---|
| `native gas token (ETH)` (comment / docs) | `native gas token (GST)` | Update all narrative + UX strings. |
| `rpcStandard: 'ethereum'` | `rpcStandard: 'evm'` (or `'ghost'`) | Prefer `'evm'` if it’s describing JSON-RPC compatibility rather than chain identity. |
| `PIL_RPC_NAMESPACE=eth` | `PIL_RPC_NAMESPACE=evm` (keep `eth` as legacy alias) | Technical: namespace selects `eth_*` JSON-RPC method names. Keep backward compat while removing “ETH” branding. |
| `GHOST_RPC_NAMESPACE=eth` | `GHOST_RPC_NAMESPACE=evm` (keep `eth` as legacy alias) | Same as above. |
| `RPC_DEPRECATE_ETH_NAMESPACE` | `RPC_DEPRECATE_LEGACY_NAMESPACE` (support both) | The behavior is about legacy JSON-RPC aliases, not currency. |
| `RPC_REJECT_ETH_NAMESPACE` | `RPC_REJECT_LEGACY_NAMESPACE` (support both) | Same as above. |

### Contracts + Scripts

| Current | Proposed | Notes |
|---|---|---|
| `DEMO_AMOUNT_ETH` | `DEMO_AMOUNT_GST` (support both) | Preserve old var as alias for one release; log deprecation. |
| `FUND_AMOUNT_ETH` | `FUND_AMOUNT_GST` (support both) | Same pattern. |
| `amountEth` | `amountGst` | Code identifiers should not encode ETH semantics. |
| `echidna_cannot_overdraw_eth()` | `echidna_cannot_overdraw_gst()` | Keep invariant semantics identical; rename only. |
| “Ethereum Signed Message” wording | “EVM signed message” (or “chain signed message”) | Avoid Ethereum branding; keep cryptographic meaning. |

### Infra / Deploy / Runtime

| Current | Proposed | Notes |
|---|---|---|
| `infra/ghostchain/docker-compose.eth.yml` | `infra/ghostchain/docker-compose.l1.yml` (or `.gst.yml`) | Rename file and update every reference (ops/docs/autonomy, scripts, runbooks). |
| `ethereum/client-go:*` image references | `ghostl/geth:*` (re-tagged) | Keep client, change branding; or build an internal image that wraps upstream. |
| `ETHEREUM_JSONRPC_*` env keys (Blockscout) | `GST_JSONRPC_*` (internal) + map to required keys | Blockscout expects `ETHEREUM_JSONRPC_*`; keep those internally but avoid exposing them as top-level user config. |
| `OP_*_ETH_RPC` env keys | `OP_*_RPC` (internal) + map to required keys | OP Stack components expect these names; introduce GST-native aliases and export legacy keys at runtime. |

### Observability (Grafana/Prometheus)

| Current | Proposed | Notes |
|---|---|---|
| Panel titles: `(... ETH)` | `(... GST)` | E.g., “Batcher balance (GST)”. |
| Grafana unit: `eth` | `none` (and label series as GST) | Grafana has a built-in “eth” unit; avoid it to prevent ETH branding leakage. |

## Explicit allowlist (technical tokens)

These must not be treated as “ETH business semantics”:

- JSON-RPC method prefix: `eth_` (e.g., `eth_getBalance`)
- JSON-RPC module name: `eth`
- EVM unit names: `wei`, `gwei` (keep, but UI labels should show GST)
