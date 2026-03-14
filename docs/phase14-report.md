# Phase 14 — Workflow Supply-Chain Hardening Gate

Date: 2026-02-21

## Goal
Validate critical workflow hardening controls for release safety:
- Immutable action pinning by commit SHA
- Top-level permissions baseline
- Main/tag scope governance for release-sensitive workflows

## Changes delivered

### 1) Added Phase 14 validator
File:
- `infra/opstack/scripts/validate-workflow-supply-chain-hardening.sh`

Checks implemented:
- Script syntax validation for the Phase 14 validator.
- Action pinning control for critical workflows:
  - `.github/workflows/ci.yml`
  - `.github/workflows/docker-publish.yml`
  - `.github/workflows/security-production-preflight.yml`
  - `.github/workflows/contracts-cascading-fast.yml`
  - `.github/workflows/ai-governance-gate.yml`
- Baseline top-level `permissions: {}` presence for those workflows.
- Release scope controls:
  - `docker-publish`: `workflow_run` and guard conditions scoped to `main`
  - `security-production-preflight`: push scope restricted to `main`
  - `ai-governance-gate`: release tag scope (`v*`) and no push-branch scope
  - `contracts-cascading-fast`: governance bridge path filter and `main` push scope

### 2) Validator robustness fixes during execution
- Normalized action `uses:` parsing to ignore trailing inline comments.
- Fixed embedded Python check syntax/indentation for deterministic gate execution.

## Validation + evidence
- Gate output: `evidence/phase14/workflow-supply-chain-gate.txt`
- Gate exit: `evidence/phase14/gate-exit.txt`
- Gate marker: `evidence/phase14/gate-status.txt`
- Script syntax: `evidence/phase14/script-syntax.txt`
- Full runner stream: `evidence/phase14/runner-output.txt`
- Evidence index: `evidence/phase14/README.md`

## Gate 14 assessment
Gate rule: critical release workflows must preserve immutable action references, least-privilege defaults, and strict main/tag deployment scope.

Status: **PASS**

Reason:
- All critical workflow `uses:` entries are validated as SHA-pinned.
- Permissions baseline and scope controls are present and aligned.
- Release/governance workflows satisfy main/tag branch discipline checks.

## Re-run command
- `infra/opstack/scripts/validate-workflow-supply-chain-hardening.sh`
