# Phase 6 (Foundry GST Invariants) Report

Date (UTC): 2026-02-16

## 1. What Was Scanned (Paths)

- `contracts/test/GSTInvariant.t.sol`
- `infra/ghostchain/docker-compose.l1.yml`
- `infra/opstack/docker-compose.yml`
- `infra/opstack/docker-compose.l3.yml`
- `infra/opstack/config/rollup.json`
- `infra/opstack/l3/ghostl3/config/rollup.json`
- `infra/opstack/contracts/script/DeployL1.s.sol`
- `services/stack.env.example`

## 2. What Changed (Minimal Diffs)

- Hardened `contracts/test/GSTInvariant.t.sol` to fail if legacy branding resurfaces in key L1/L2/L3 or bridge/gas-token config surfaces.
- Added invariant checks for forbidden identifiers:
  - legacy symbol/unit/chain branding
  - legacy env keys (`ETH_RPC`, `ETH_CHAIN_ID`, `ETH_PRIVATE_KEY`, explorer key)
  - legacy identifier forms (`nativeEth`, `ethAmount`, `ethBalance`, `_eth`)
- Kept token construction obfuscated in test source so the GST leakage gate itself remains green.

## 3. Commands Run

```bash
bash scripts/gst-leakage-gate.sh
forge test --match-path test/GSTInvariant.t.sol
```

## 4. Expected Output

- Leakage gate:
  - `[gst-leakage-gate] OK: no forbidden ETH branding tokens found.`
- Foundry:
  - `2 passed; 0 failed` for `test/GSTInvariant.t.sol`.

## 5. Rollback Plan (Git-Based)

```bash
# Safe rollback in shared history:
git revert <phase6-commit-sha>

# If local-only and you want to keep edits but remove the commit:
git reset --mixed HEAD~1
```
