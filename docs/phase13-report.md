# Phase 13 — Release Workflow Governance Controls Gate

Date: 2026-02-21

## Goal
Validate that production-sensitive release workflows remain scoped to `main` and release tags, consistent with branch protection governance.

## Changes delivered

### 1) Hardened docker publish workflow scope
File:
- `.github/workflows/docker-publish.yml`

Change:
- Removed `master` branch support from `workflow_run` branch filters and branch conditionals.
- Kept publishing/deploy scope aligned to `main` only.

### 2) Added Phase 13 validator
File:
- `infra/opstack/scripts/validate-release-workflow-governance.sh`

Checks implemented:
- Validator script syntax check.
- `Docker Publish` is `main`-only and contains no `master` references.
- `Security Production Preflight` remains `main`-scoped.
- `AI Governance Gate` remains release tag-scoped.
- `Contracts Cascading Finality (Fast)` remains `main` push scoped with governance bridge path filters.
- Branch protection checklist still states release workflow scope requirement.

## Validation + evidence
- Gate output: `evidence/phase13/release-workflow-governance-gate.txt`
- Gate exit: `evidence/phase13/gate-exit.txt`
- Gate marker: `evidence/phase13/gate-status.txt`
- Script syntax: `evidence/phase13/script-syntax.txt`
- Full runner stream: `evidence/phase13/runner-output.txt`
- Evidence index: `evidence/phase13/README.md`

## Gate 13 assessment
Gate rule: production-sensitive workflow scope controls must remain aligned to governance policy (`main` + release tags), with no legacy branch drift.

Status: **PASS**

Reason:
- Docker publish branch scope is now `main`-only.
- Security preflight and contracts cascading workflows satisfy expected branch/path scope.
- AI governance gate remains tag-scoped.
- Checklist governance statement is present.

## Re-run command
- `infra/opstack/scripts/validate-release-workflow-governance.sh`
