# Phase 3 — Finality Assurance (Guarded, Draft-Only)

## Overview
- **Service:** `services/consensus-telemetry-service`
- **Scope:** Observe-only finality checks for:
  - L2 → L1 output oracle correctness
  - L3 → L2 output oracle correctness
  - L2 ↔ L3 bridge event invariants
- **Outputs:**
  - Proof-of-issue bundles under `/data/evidence`
  - Draft governance proposal payloads under `/data/proposals` (never auto-sent)

## Watchers
1) **Output Oracle Checks**
   - Validates latest output index/block/root and detects stale or inconsistent outputs.
   - L2 output oracle is read from L1 RPC.
   - L3 output oracle is read from L2 RPC.

2) **Bridge Invariants**
   - Ensures `Finalized` events match `DepositInitiated` (native + ERC20).
   - Flags deposits that remain unfinalized beyond a stale threshold.

## Evidence + Proposal Drafts
When an `oracle_*` or `bridge_*` incident opens:
- A proof bundle is written (JSON + hash) to `/data/evidence`
- A proposal draft is written to `/data/proposals` containing pause options
  (PauseGuardian `setPaused(true)` and `pause()`)

## Config (env)
Key settings in `services/consensus-telemetry-service/.env`:
- `FINALITY_ENABLED`, `DRAFT_PROPOSALS_ENABLED`
- `L2_OUTPUT_ORACLE_ADDRESS`, `L3_OUTPUT_ORACLE_ADDRESS`
- `L2_OUTPUT_ORACLE_RPC`, `L3_OUTPUT_ORACLE_RPC`
- `ORACLE_MAX_BLOCK_DRIFT_L2`, `ORACLE_MAX_BLOCK_DRIFT_L3`
- `ORACLE_MAX_AGE_SEC_L2`, `ORACLE_MAX_AGE_SEC_L3`
- `BRIDGE_WATCH_ENABLED`, `BRIDGE_CONFIRMATIONS`
- `BRIDGE_EVENT_WINDOW_BLOCKS`, `BRIDGE_STALE_SEC`
- `GOVERNOR_ADDRESS_L1`, `PAUSE_GUARDIAN_ADDRESS`

## Validation
- Start the service and inspect `/consensus` output:
  - `finality` section shows oracle snapshots
  - `bridge` section shows pending deposits and last scanned block
- Check `/metrics` for `ghost_consensus_output_oracle_*` and `ghost_consensus_bridge_*`.

