# GhostStack Autonomy Bootstrap Plan

Generated: 2026-02-04

## Scope
- Diff-only changes.
- No chain resets, no state wipes, no core contract redeploys.
- Sequential, gated execution with evidence output.

## Phase 0 — Preflight (read-only)
- Inventory docs (already generated):
  - docs/autonomy/inventory.md
  - docs/autonomy/service-map.mmd
  - docs/autonomy/ports-and-endpoints.md

## Phase 1 — Bootstrap Automation (this step)
1. Add ops/scripts/ghostctl (skeleton) with safe subcommand dispatch.
2. Update ops/scripts/preflight.sh to spec (binaries, disk/RAM, port/env checks, RPC reachability).
3. Ensure headers are embedded verbatim in automation scripts.

## Phase 2 — Build/Up/Doctor/Scan Skeletons
- Add build.sh, up.sh, doctor.sh, scan.sh, remediate.sh, attest.sh, ci_local.sh
- Wire into ghostctl (no behavior changes beyond automation).

## Phase 3 — Healthcheck & Hardening Standards
- Inventory missing healthchecks and add via controlled mappings.
- Add docs/autonomy/health-contract.md.

## Phase 4 — Vulnerability Gates + Evidence
- Implement scans, remediation loop, SBOMs, attestations.
- Add CI workflows once local scripts are stable.

## Exit Criteria for Phase 1
- ghostctl skeleton present and executable.
- preflight.sh meets spec and produces summary JSON.
- No runtime state changes beyond read-only checks.
