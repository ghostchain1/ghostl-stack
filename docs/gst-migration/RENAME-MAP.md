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

---

## Refresh: 2026-02-14 (rev 3204773e)

This section updates the Phase 2 rename plan based on the current head and current ETH/Ethereum leakage hotspots.

### Infra / Chains (L1/L2/L3)

| Current | Proposed | Notes |
|---|---|---|
| `ethereum/client-go:*` image refs (e.g. `infra/ghostchain/.env`, `infra/ghostchain/docker-compose.l1.yml`) | `ghostl/geth:*` (mirrored/retagged) | Keep runtime identical; remove Ethereum-branded image name from first-party config. |
| `ghcr.io/ethereum-optimism/*` image refs in k8s blueprints | Mirror to `ghcr.io/ghostl/*` (or internal registry) | This is upstream naming; avoid product configs referencing `ethereum-*` registries if “Ethereum” is considered forbidden branding. |
| `OP_*_ETH_RPC` env keys (compose, k8s, rendered compose) | Canonical: `OP_*_{L1,L2}_RPC` (or `OP_*_RPC`) + runtime export legacy keys | OP Stack expects `*_ETH_RPC`. Keep compatibility by exporting legacy keys inside entrypoint wrappers while presenting GST-native keys to operators. |
| Besu `--rpc-http-api=ETH,...` | Allowlist exact token in leakage gate | It’s a technical module name, not currency. Don’t attempt to rename; gate should permit this exact pattern. |
| `infra/opstack/docker-compose.mainnet-geth.yml` uses `ethereum/client-go:stable` | Mirror to `ghostl/geth:stable` | Treat as “external chain dependency”; still remove Ethereum-branded image string from first-party config. |

### Services

| Current | Proposed | Notes |
|---|---|---|
| `ETHEREUM_JSONRPC_{HTTP,TRACE,WS}_URL` (Blockscout env) | Canonical: `GST_JSONRPC_{HTTP,TRACE,WS}_URL` + map to Blockscout keys at runtime | Blockscout conventions require `ETHEREUM_JSONRPC_*`. Keep inside service wiring only; don’t expose as top-level operator knobs. |
| `EXTERNAL_CHAINS=ethereum,polygon,optimism` | `EXTERNAL_CHAINS=mainnet,polygon,optimism` (map `mainnet` → Ethereum internally) | Removes the literal `ethereum` token from env/config while preserving meaning. |
| “ETH-like settlement” wording | “native settlement” / “EVM-like settlement” | Avoid ETH branding in docs/config comments. |

### Contracts + Scripts

| Current | Proposed | Notes |
|---|---|---|
| `LGE_DEPOSIT_ETH` | `LGE_DEPOSIT_GST` (support `LGE_DEPOSIT_ETH` as legacy alias for one release) | Remove ETH semantics from env keys; preserve a soft migration window. |
| `DEMO_AMOUNT_ETH`, `FUND_AMOUNT_ETH` (legacy aliases) | Deprecate and remove after grace period; keep `*_GST` canonical | Already partially migrated (GST canonical, ETH fallback). Phase 2 should decide the deprecation schedule and implement warnings. |
| Contract comments / revert strings containing `ETH` or `eth` | Replace with `GST` or `native` wording | E.g. “native gas token”, “native send/transfer”, “legacy namespace”, etc. Avoid leaking `eth` in revert strings. |
| `ethereum/solc:*` in `contracts/scripts/solc-docker/*` | Mirror to internal `ghostl/solc:*` | Same rationale as geth images: keep upstream but remove branding strings from first-party scripts. |

### Docs / Diagrams / Launch System

| Current | Proposed | Notes |
|---|---|---|
| Mermaid node `ETH[Ethereum]` | `GST[Ghost Token]` (or neutral `L1`) | Diagrams should match canonical GST-native branding. |
| Runbook examples using `LGE_DEPOSIT_ETH` | Use `LGE_DEPOSIT_GST` | Keep legacy alias mentioned only in migration docs if needed. |
| `launch-system/lib/ethrpc.py` + “Ethereum-compatible” strings | `evmrpc.py` + “EVM-compatible” | Keep a tiny shim file (old import path) if internal scripts depend on `ethrpc.py`. |
