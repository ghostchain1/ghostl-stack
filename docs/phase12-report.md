# Phase 12 — Branch Protection Controls Gate

Date: 2026-02-21

## Goal
Validate repository branch-protection governance controls and ensure automation/checklist/workflows remain aligned.

## Changes delivered

### 1) Fixed dry-run safety in branch protection apply script
File:
- `scripts/github/apply-branch-protection.sh`

Fix:
- Updated `ensure_label` to short-circuit in `--dry-run` mode, making dry-run truly non-mutating.

### 2) Added Phase 12 validator
File:
- `infra/opstack/scripts/validate-branch-protection-controls.sh`

Checks implemented:
- Syntax checks:
  - `scripts/github/apply-branch-protection.sh`
  - `infra/opstack/scripts/validate-branch-protection-controls.sh`
- Required status check contexts are present in branch protection apply script.
- Required CI/security jobs exist in workflows:
  - `.github/workflows/ci.yml`
  - `.github/workflows/security-production-preflight.yml`
- Checklist contains required checks:
  - `docs/checklists/BRANCH_PROTECTION_SECURITY.md`
- Executes safe dry-run:
  - `scripts/github/apply-branch-protection.sh ghostchain1/ghostl-stack main --dry-run`

## Validation + evidence
- Gate output: `evidence/phase12/branch-protection-gate.txt`
- Gate exit: `evidence/phase12/gate-exit.txt`
- Gate marker: `evidence/phase12/gate-status.txt`
- Dry-run output: `evidence/phase12/apply-branch-protection-dry-run.txt`
- Evidence index: `evidence/phase12/README.md`

## Gate 12 assessment
Gate rule: branch protection controls must be internally consistent (checklist, automation, and workflow jobs) and dry-run must be safe.

Status: **PASS**

Reason:
- Required checks are present in checklist and automation script.
- Corresponding workflow jobs are present.
- Branch-protection dry-run executes successfully and remains non-mutating.

## Re-run command
- `infra/opstack/scripts/validate-branch-protection-controls.sh`
