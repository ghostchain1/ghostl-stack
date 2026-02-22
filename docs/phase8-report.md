# Phase 8 — Bridge Wiring Gate

Date: 2026-02-21

## Goal
Validate bridge wiring correctness for:
- L3 -> L2 (bridge target, messenger target, gas-limit sanity)
- L2 -> L1 (bridge target, portal target)

## Changes delivered

### 1) Added bridge wiring validation script
File:
- `infra/opstack/scripts/validate-bridge-wiring.sh`

Checks performed:
- `L3StandardBridge` -> `OTHER_BRIDGE()` matches `L3_PARENT_STANDARD_BRIDGE_ADDRESS`
- `L3StandardBridge` -> `MESSENGER()` matches L3 messenger predeploy
- `L3 messenger` -> `OTHER_MESSENGER()` matches `L3_PARENT_CROSS_DOMAIN_MESSENGER_ADDRESS`
- L3 messenger gas constants sanity:
  - `MIN_GAS_CALLDATA_OVERHEAD` > 0
  - `MIN_GAS_DYNAMIC_OVERHEAD_DENOMINATOR` > 0
  - `MIN_GAS_DYNAMIC_OVERHEAD_NUMERATOR` within bounded range
- `L2StandardBridge` -> `OTHER_BRIDGE()` matches `L1_STANDARD_BRIDGE_ADDRESS`
- `L1 messenger` -> `PORTAL()` matches `OPTIMISM_PORTAL_ADDRESS` / `L2_PORTAL_ADDRESS`

### 2) Evidence capture
- Added full Phase 8 artifact set under `evidence/phase8/`.

## Validation + evidence
- Gate output: `evidence/phase8/bridge-wiring-gate.txt`
- Gate status: `evidence/phase8/gate-status.txt`
- Drift summary: `evidence/phase8/wiring-drift-notes.txt`
- Smoke run: `evidence/phase8/smoke-consensus-autonomy.txt`
- Index: `evidence/phase8/README.md`

## Gate 8 assessment
Gate rule: bridge parent pointers and portal/messenger wiring must match configured counterparts.

Status: **CONDITIONAL FAIL (live config drift)**

Reason:
- L3 -> L2 parent bridge/messenger pointers on-chain differ from configured `infra/opstack/.env.l3` addresses.
- L2 -> L1 checks pass.
- Gas-limit constants are sane.

## Remediation
Update L3 parent wiring env values to current on-chain values and re-run gate:
- `L3_PARENT_STANDARD_BRIDGE_ADDRESS=0x061c137864195998838574dA9E822102fA029D70`
- `L3_PARENT_CROSS_DOMAIN_MESSENGER_ADDRESS=0xEA7cFd038c520128C244426766fb7d10804002f5`

Then run:
- `bash infra/opstack/scripts/validate-bridge-wiring.sh`
