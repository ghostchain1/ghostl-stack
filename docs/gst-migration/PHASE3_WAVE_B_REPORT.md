# Phase 3 Wave B (Identifier Renames) Report

Date (UTC): 2026-02-16

## Changes Applied

- `contracts/src/governance/constitutions/GSTConstitution.sol`
  - `CLAUSE_NO_ETH_BRANDING` -> `CLAUSE_NO_LEGACY_BRANDING`
  - `ghost.constitution.no_eth_branding.v1` -> `ghost.constitution.no_legacy_branding.v1`
- `services/ghost-rpc-proxy/index.mjs`
  - removed legacy env aliases:
    - `RPC_DEPRECATE_ETH_NAMESPACE`
    - `RPC_REJECT_ETH_NAMESPACE`
  - canonical controls remain:
    - `RPC_DEPRECATE_LEGACY_NAMESPACE`
    - `RPC_REJECT_LEGACY_NAMESPACE`

## Validation Commands

```bash
bash scripts/gst-leakage-gate.sh
git grep -n -E "no_eth_branding|CLAUSE_NO_ETH|RPC_DEPRECATE_ETH_NAMESPACE|RPC_REJECT_ETH_NAMESPACE" -- contracts/src services
```

## Result

- leakage gate: pass
- targeted identifier scan in source paths: no matches
