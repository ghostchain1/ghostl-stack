# Phase 2 Proposed Diffs (Do Not Apply Yet)

Generated: 2026-02-16T15:53:51Z

## L1 (GhostChain)

1. `infra/ghostchain/.env.l1.example`
- Optional hardening: swap `L1_GETH_IMAGE=ethereum/client-go:...` to a repo-curated alias if available (e.g. `ghostl/geth:...`) to remove legacy vendor token from first-party env examples.

2. `infra/ghostchain/scripts/ghostscout-entrypoint.sh`
- Keep `GHOSTSCOUT_UPSTREAM_*` as canonical inputs.
- Retain `ETHEREUM_JSONRPC_*` assignments only as compatibility shim output for Blockscout runtime.
- Add explicit inline comment noting this as approved technical exception.

3. `services/ghostscout-l1/entrypoint.sh`
- Same compatibility-shim annotation as above.

## L2 (GhostL2)

1. `services/ghostscout-l2/entrypoint.sh`
- Same compatibility-shim annotation as L1.

## L3 (GhostL3)

1. `services/ghostscout-l3/entrypoint.sh`
- Same compatibility-shim annotation as L1/L2.

## Cross-Layer

1. `contracts/src/governance/constitutions/GSTConstitution.sol`
- Optional lexical hardening for future leakage gate:
  - `ghost.constitution.no_legacy_eth_surface.v1` -> `ghost.constitution.no_legacy_branding_surface.v1`
  - `ghost.policy.branding.no_legacy_eth_surface` -> `ghost.policy.branding.no_legacy_branding_surface`
  - keep backward-compatible aliases if downstream hash consumers exist.

2. `config/gst-allowlist.txt` (Phase 4 precursor)
- Keep allowlist tiny and explicit for:
  - vendor naming (`ethereum/client-go`)
  - compatibility shim keys (`ETHEREUM_JSONRPC_*`)
  - technical `eth_*` RPC/module namespaces.

## Not Proposed (already compliant)

- Canonical gas token metadata is already GST-native in:
  - `infra/opstack/.env`
  - `infra/opstack/.env.l2`
  - `services/ghost-registry/src/health/checker.ts`
  - `services/ghost-gas-engine/config/chains.json`
  - `apps/api/src/server.ts`
- External chain labels already normalized in:
  - `services/stack.env` (`EXTERNAL_CHAINS=evm-mainnet,polygon,optimism`)
