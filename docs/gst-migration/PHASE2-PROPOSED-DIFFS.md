# Phase 2 Proposed Diffs (Do Not Apply Yet)

Generated: 2026-02-16T12:03:00Z

## L1 (GhostChain)

1. `infra/ghostchain/scripts/ghostscout-entrypoint.sh`
- Introduce neutral internal compatibility variables:
  - `GHOSTSCOUT_UPSTREAM_HTTP_URL`
  - `GHOSTSCOUT_UPSTREAM_TRACE_URL`
  - `GHOSTSCOUT_UPSTREAM_WS_URL`
- Keep legacy `ETHEREUM_JSONRPC_*` assignments strictly inside the entrypoint shim.

2. `services/ghostscout-l1/entrypoint.sh`
- Same shim normalization as above.

3. `services/stack.env`
- Replace `EXTERNAL_CHAINS=ethereum,polygon,optimism` with GST policy-safe external labels (e.g. `evm-mainnet,polygon,optimism`).

## L2 (GhostL2)

1. `infra/opstack/.env`
- `GAS_TOKEN_SYMBOL=GHOST` -> `GAS_TOKEN_SYMBOL=GST`
- `GAS_TOKEN_NAME="Ghost Token (L1)"` -> `GAS_TOKEN_NAME="Ghost Token"`

2. `infra/opstack/.env.l2`
- `GAS_TOKEN_SYMBOL=GHOST` -> `GAS_TOKEN_SYMBOL=GST`
- `GAS_TOKEN_NAME="Ghost Token (L1)"` -> `GAS_TOKEN_NAME="Ghost Token"`

3. `services/ghostscout-l2/entrypoint.sh`
- Same compatibility-shim normalization as L1.

## L3 (GhostL3)

1. `services/ghostscout-l3/entrypoint.sh`
- Same compatibility-shim normalization as L1/L2.

## Cross-Layer

1. `contracts/src/governance/constitutions/GSTConstitution.sol`
- Optional lexical hardening for future leakage gate:
  - `CLAUSE_NO_ETH_BRANDING` -> `CLAUSE_NO_LEGACY_BRANDING`
  - `ghost.constitution.no_eth_branding.v1` -> `ghost.constitution.no_legacy_branding.v1`

2. `config/gst-allowlist.txt` (Phase 4 precursor)
- Add explicit temporary allowlist entries for:
  - Solidity `ether` denomination keyword in tests/contracts
  - upstream compatibility keys required by third-party explorers
  - technical `eth_*` RPC methods

## Not Proposed (already compliant)

- Canonical gas token metadata in:
  - `services/ghost-registry/src/health/checker.ts`
  - `services/ghost-gas-engine/config/chains.json`
  - `apps/api/src/server.ts`
- Explorer `COIN=GST` across `services/ghostscout-{l1,l2,l3}/.env`
