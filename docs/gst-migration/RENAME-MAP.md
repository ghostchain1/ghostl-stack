# Rename Map (Phase 1 — Proposed)

Generated: 2026-02-16T15:53:51Z

This map is scoped to first-party GhostStack paths and split into:
- `detected_current`: values still containing legacy ETH/Ethereum strings in technical contexts
- `forward_rule`: proposed Phase 2 rename/shim rule (do not apply in Phase 1)

## GhostChain L1

### detected_current
- `infra/ghostchain/scripts/ghostscout-entrypoint.sh`
  - `ETHEREUM_JSONRPC_HTTP_URL`
  - `ETHEREUM_JSONRPC_TRACE_URL`
  - `ETHEREUM_JSONRPC_WS_URL`
- `services/ghostscout-l1/entrypoint.sh`
  - `ETHEREUM_JSONRPC_HTTP_URL`
  - `ETHEREUM_JSONRPC_TRACE_URL`
  - `ETHEREUM_JSONRPC_WS_URL`
- `infra/ghostchain/.env.l1.example`
  - `L1_GETH_IMAGE=ethereum/client-go:...`
- `infra/ghostchain/docker-compose.ibft.yml`
  - `--rpc-http-api=ETH,NET,WEB3,...`

### forward_rule
- Keep `ETHEREUM_JSONRPC_*` only as downstream compatibility keys in entrypoint shims.
- Keep `GHOSTSCOUT_UPSTREAM_*` as canonical operator-facing keys.
- Document vendor image/module strings (`ethereum/client-go`, `ETH` RPC module) as technical exceptions in allowlist policy notes.

## GhostL2

### detected_current
- `services/ghostscout-l2/entrypoint.sh`
  - `ETHEREUM_JSONRPC_HTTP_URL`
  - `ETHEREUM_JSONRPC_TRACE_URL`
  - `ETHEREUM_JSONRPC_WS_URL`

### forward_rule
- Same compatibility rule as L1: canonical GST-prefixed vars in config, legacy `ETHEREUM_JSONRPC_*` only in bootstrap translation layer.

## GhostL3

### detected_current
- `services/ghostscout-l3/entrypoint.sh`
  - `ETHEREUM_JSONRPC_HTTP_URL`
  - `ETHEREUM_JSONRPC_TRACE_URL`
  - `ETHEREUM_JSONRPC_WS_URL`

### forward_rule
- Same compatibility rule as L1/L2.

## Cross-Service / Shared

### detected_current
- `infra/scripts/chains/deploy_l2oo.sh`
  - Go import namespace `github.com/ethereum*` (upstream package naming)
- `contracts/src/governance/constitutions/GSTConstitution.sol`
  - `CLAUSE_NO_LEGACY_BRANDING_SURFACES = ...no_legacy_eth_surface...`
  - `POLICY_NO_LEGACY_BRANDING_SURFACES = ...no_legacy_eth_surface...`

### forward_rule
- Keep upstream Go import paths unchanged (required by dependency names).
- Optional lexical cleanup in governance constants:
  - `no_legacy_eth_surface` -> `no_legacy_branding_surface`
  - Maintain backward-compatible aliases if proposal tooling depends on current hashes.

## DTO / API / DB / Metrics Renames

### detected_current
- No matches in first-party scope for:
  - `ethAmount`, `ethBalance`, `nativeEth`
  - `*_eth` identifiers
  - `ETH_RPC`, `ETH_CHAIN_ID`, `ETH_PRIVATE_KEY`, `ghostCAN_*`

### forward_rule
- Keep enforced rename policy as guardrail:
  - `*_eth -> *_gst`
  - `ethAmount -> gstAmount`
  - `ethBalance -> gstBalance`
  - `nativeEth -> nativeGst`
  - `ETH_RPC -> GST_L1_RPC` (or `GHOSTCHAIN_RPC`)
  - `ETH_CHAIN_ID -> GHOSTCHAIN_CHAIN_ID`
  - `ETH_PRIVATE_KEY -> GST_SIGNER_PRIVATE_KEY`

## Allowlist Candidates (explicit justification required)

- JSON-RPC method namespace: `eth_*`
- RPC module token `ETH` in geth/besu API lists
- Upstream dependency/vendor identifiers containing `ethereum`
- Solidity unit keyword `ether` where it denotes numeric denomination, not branding
