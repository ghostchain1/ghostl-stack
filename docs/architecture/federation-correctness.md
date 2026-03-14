# Federation Correctness (Phase 3)

Last updated: 2026-02-04

## Goals
- Validate anchoring between L1->L2 and L2->L3.
- Verify output oracle and portal contracts exist on parent layers.
- Provide actionable checks for parent/child lag.

## Scripts

### federation-check.sh
Location: `infra/scripts/federation-check.sh`

Checks:
- RPC reachability for L1/L2/L3
- Chain IDs
- Parent sync lag (using latest block timestamps)
- Contract code presence:
  - `L2_OUTPUT_ORACLE_ADDRESS` on L1
  - `L3_L2OO_ADDRESS` on L2
  - `L3_PORTAL_ADDRESS` on L2

Run:
```bash
bash infra/scripts/federation-check.sh
```

## E2E Bridge Tests
Script: `infra/scripts/bridge-e2e.sh`

Modes:
- `l2l3` (implemented): ERC20 deposit/relay/withdraw using existing demo scripts.
- `l1l2` (implemented): ERC20 deposit/withdraw using StandardBridge demo scripts.

Run (dry-run default):
```bash
bash infra/scripts/bridge-e2e.sh --mode l2l3
bash infra/scripts/bridge-e2e.sh --mode l1l2
```

Run (execute):
```bash
bash infra/scripts/bridge-e2e.sh --mode l2l3 --run --amount 1
bash infra/scripts/bridge-e2e.sh --mode l1l2 --run --amount 1
```

TODOs:
- Revert-path tests
- Add L1<->L2 relayer health checks (if required in your deployment)

## Gate Criteria (Phase 3)
- `federation-check.sh` succeeds.
- Doctor scripts for each layer are green:
  - `infra/scripts/doctor-l1.sh`
  - `infra/scripts/doctor-l2.sh`
  - `infra/scripts/doctor-l3.sh`
- E2E bridge tests pass.

## Notes
- Parent sync lag is derived from block timestamps and is a proxy for output lag.
- `bridge-e2e.sh` is intentionally minimal; use it as a smoke test, not a full audit harness.
