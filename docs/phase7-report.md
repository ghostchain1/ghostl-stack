# Phase 7 — Docker / Node Hygiene Gate

Date: 2026-02-21

## Goal
Enforce runtime hygiene preconditions before continuing stack operations:
- data directories are present and writable,
- genesis configuration has not drifted against persisted node data,
- explicit reset path exists when a clean re-init is required.

## Changes delivered

### 1) Added hygiene gate script
File:
- `infra/opstack/scripts/validate-node-hygiene.sh`

Modes:
- `check` (default):
  - ensures required L2/L3 runtime directories exist,
  - verifies write access with probe files,
  - validates/stamps genesis SHA256 markers to detect stale genesis mismatches.
- `prepare` (destructive):
  - resets target data directories,
  - recreates directories with writable permissions,
  - stamps fresh genesis fingerprints.

Validated directories (from active env):
- `infra/opstack/data/l2-geth-901`
- `infra/opstack/data/op-node`
- `infra/opstack/data/op-sequencer`
- `infra/opstack/l3/ghostl3/data-903`

### 2) Evidence and gate artifacts
- Added Phase 7 evidence pack under `evidence/phase7/`.

## Validation + evidence
- Gate script syntax: `evidence/phase7/phase7-script-syntax.txt`
- Gate execution output: `evidence/phase7/node-hygiene-gate.txt`
- Gate status marker: `evidence/phase7/gate-status.txt`
- Script executable proof: `evidence/phase7/script-permissions.txt`
- Smoke gate run: `evidence/phase7/smoke-consensus-autonomy.txt`
- Evidence index: `evidence/phase7/README.md`

## Gate 7 assessment
Gate rule: fresh/writable node data paths and stale-genesis safeguards are verifiably in place.

Status: **PASS**

Reason:
- Gate run reported writable paths for all required L2/L3 data dirs.
- Genesis stamps were initialized and validated with no mismatches.
- Post-change smoke run remained green.
