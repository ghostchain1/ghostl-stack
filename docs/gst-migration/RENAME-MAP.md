# Rename Map (Phase 1 — Proposed)

Generated: 2026-02-16T12:03:00Z

This map is scoped to **first-party GhostStack paths** and split into:
- `detected_current`: key/value currently present and targeted for migration or explicit allowlist
- `forward_rule`: required rename rule to enforce during Phase 2/3

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

### forward_rule
- Runtime compatibility shim variables (Blockscout):
  - `ETHEREUM_JSONRPC_HTTP_URL -> GHOSTSCOUT_UPSTREAM_HTTP_URL` (internal alias)
  - `ETHEREUM_JSONRPC_TRACE_URL -> GHOSTSCOUT_UPSTREAM_TRACE_URL` (internal alias)
  - `ETHEREUM_JSONRPC_WS_URL -> GHOSTSCOUT_UPSTREAM_WS_URL` (internal alias)
  - Keep one-way assignment to legacy keys only inside entrypoint bootstrap code.
- Image branding:
  - `ethereum/client-go` reference is technical vendor naming; keep only under explicit allowlist comment in gate config.

## GhostL2

### detected_current
- `services/ghostscout-l2/entrypoint.sh`
  - `ETHEREUM_JSONRPC_HTTP_URL`
  - `ETHEREUM_JSONRPC_TRACE_URL`
  - `ETHEREUM_JSONRPC_WS_URL`
- `infra/opstack/.env`
  - `GAS_TOKEN_SYMBOL=GHOST`
  - `GAS_TOKEN_NAME="Ghost Token (L1)"`
- `infra/opstack/.env.l2`
  - `GAS_TOKEN_SYMBOL=GHOST`
  - `GAS_TOKEN_NAME="Ghost Token (L1)"`

### forward_rule
- Explorer runtime shim keys same as L1 (`ETHEREUM_JSONRPC_* -> GHOSTSCOUT_UPSTREAM_*`).
- OP token branding normalization:
  - `GAS_TOKEN_SYMBOL: GHOST -> GST`
  - `GAS_TOKEN_NAME: "Ghost Token (L1)" -> "Ghost Token"`

## GhostL3

### detected_current
- `services/ghostscout-l3/entrypoint.sh`
  - `ETHEREUM_JSONRPC_HTTP_URL`
  - `ETHEREUM_JSONRPC_TRACE_URL`
  - `ETHEREUM_JSONRPC_WS_URL`

### forward_rule
- Explorer runtime shim keys same as L1/L2 (`ETHEREUM_JSONRPC_* -> GHOSTSCOUT_UPSTREAM_*`).

## Cross-Service / Shared

### detected_current
- `services/stack.env`
  - `EXTERNAL_CHAINS=ethereum,polygon,optimism`
- `contracts/src/governance/constitutions/GSTConstitution.sol`
  - `CLAUSE_NO_ETH_BRANDING` / `ghost.constitution.no_eth_branding.v1`

### forward_rule
- External chain label normalization:
  - `ethereum -> evm-mainnet` (or `external-evm-l1`; choose one canonical label)
- Governance identifier cleanup (optional but preferred for lexical gate hygiene):
  - `CLAUSE_NO_ETH_BRANDING -> CLAUSE_NO_LEGACY_BRANDING`
  - `ghost.constitution.no_eth_branding.v1 -> ghost.constitution.no_legacy_branding.v1`

## DTO / API / DB / Metrics Renames

### detected_current
- No `ethAmount`, `ethBalance`, `nativeEth`, `*_eth` DTO/API/DB field names found in targeted first-party scope.
- No `ETH_RPC`, `ETH_CHAIN_ID`, `ETH_PRIVATE_KEY`, `ETHERSCAN_*` env keys found in targeted first-party scope.

### forward_rule
- Identifiers:
  - `*_eth -> *_gst`
  - `ethAmount -> gstAmount`
  - `ethBalance -> gstBalance`
  - `nativeEth -> nativeGst`
- Config keys:
  - `ETH_RPC -> GST_L1_RPC` (or `GHOSTCHAIN_RPC`)
  - `ETH_CHAIN_ID -> GHOSTCHAIN_CHAIN_ID`
  - `ETH_PRIVATE_KEY -> GST_SIGNER_PRIVATE_KEY`
- Metrics:
  - `*_eth_* -> *_gst_*`
  - canonical metrics family: `ghostchain_gst_*`

## Allowlist Candidates (explicit justification required)

- Technical JSON-RPC method namespace usage: `eth_*`.
- Solidity denomination keyword `ether` in code/tests where it denotes `1e18` unit semantics, not user-facing branding.
- Third-party/runtime compatibility variables required by upstream components (e.g., Blockscout `ETHEREUM_JSONRPC_*`) only when hidden behind GST-native wrapper env.
