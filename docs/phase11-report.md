# Phase 11 — Operational Readiness Gate

Date: 2026-02-21

## Goal
Establish a post-deployment operational readiness checkpoint after Gate 10 using only non-transactional checks:
- Layer doctors (L1/L2/L3)
- Critical control-plane health endpoints
- Core smoke/invariant scripts

## Changes delivered

### 1) Added Phase 11 validator
File:
- `infra/opstack/scripts/validate-operational-readiness.sh`

Validation scope:
- Runs:
  - `infra/scripts/doctor-l1.sh`
  - `infra/scripts/doctor-l2.sh`
  - `infra/scripts/doctor-l3.sh`
- Verifies health endpoints:
  - ghost-guard (`/health`)
  - ghost-relayer (`/health`)
  - ai-monitor (`/health`)
- Runs non-destructive smoke checks:
  - `scripts/smoke/consensus-autonomy.sh`
  - `scripts/smoke/federation-invariants.sh`
  - `scripts/smoke/ai-stability.sh`
- Emits machine-readable gate summary JSON and per-check logs under `evidence/phase11/`.

### 2) Linux host alias resilience
- Normalizes `host.docker.internal` URLs to `localhost` when alias resolution is unavailable on host Linux runtime.

## Validation + evidence
- Gate output: `evidence/phase11/operational-readiness-gate.txt`
- Gate exit: `evidence/phase11/gate-exit.txt`
- Gate marker: `evidence/phase11/gate-status.txt`
- Script syntax: `evidence/phase11/script-syntax.txt`
- Full runner stream: `evidence/phase11/runner-output.txt`
- Evidence index: `evidence/phase11/README.md`

## Gate 11 assessment
Gate rule: doctors, control-plane health, and non-destructive operational smokes must all pass.

Status: **PASS**

Reason:
- L1/L2/L3 doctors all returned `exitCode=0`.
- Guard/Relayer/AI Monitor health probes all returned `exitCode=0`.
- Consensus autonomy, federation invariants, and AI stability smoke checks all returned `exitCode=0`.

## Re-run command
- `infra/opstack/scripts/validate-operational-readiness.sh`
