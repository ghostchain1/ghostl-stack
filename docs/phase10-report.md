# Phase 10 — Fault & Safety Controls Gate

Date: 2026-02-21

## Goal
Validate testnet-level fault/safety controls after bridge smoke stabilization:
- Dispute games enabled (fault-proof path)
- Emergency pause at L2
- Rate limits on L3 messaging
- Manual finalization disabled on L3 path

## Changes delivered

### 1) Added Phase 10 validator
File:
- `infra/opstack/scripts/validate-fault-safety-controls.sh`

Checks implemented:
- Verifies L2 dispute game factory has code on L1.
- Verifies L3 dispute game factory has code on L2.
- Verifies L2 emergency pause control plane is available:
  - `GUARD_POLICY_ADDRESS` contract code present on L2
  - `ghost-guard` policy endpoint responds with mode in `{allow,delay,pause}`
- Verifies L3 messaging rate limiter is enabled in guard runtime:
  - `RATE_LIMIT_WINDOW_MS > 0`
  - `RATE_LIMIT_MAX > 0`
- Verifies manual finalization lock on bridge path:
  - reads bridge `relayer()`
  - simulates non-relayer `finalizeToL3(...)` call and requires `not relayer` revert

### 2) Linux host fallback hardening
- Added host URL normalization for `host.docker.internal` in the Phase 10 script so checks are stable on Linux hosts where that alias may not resolve.

## Validation + evidence
- Gate output: `evidence/phase10/fault-safety-gate.txt`
- Gate exit: `evidence/phase10/gate-exit.txt`
- Gate marker: `evidence/phase10/gate-status.txt`
- Script syntax: `evidence/phase10/script-syntax.txt`
- Post-change smoke: `evidence/phase10/smoke-consensus-autonomy.txt`
- Post-change smoke status: `evidence/phase10/smoke-consensus-autonomy-status.txt`
- Postflight preflight check: `evidence/phase10/opstack-check-postflight.txt`
- Postflight proposer check: `evidence/phase10/validate-proposer-postflight.txt`
- Postflight node hygiene check: `evidence/phase10/validate-node-hygiene-postflight.txt`
- Postflight bridge wiring remediation check: `evidence/phase10/validate-bridge-wiring-remediated.txt`
- Evidence index: `evidence/phase10/README.md`

## Gate 10 assessment
Gate rule: all four fault/safety controls must be verifiable in runtime configuration.

Status: **PASS**

Reason:
- Dispute game factories are deployed on parent chains and return non-zero bytecode.
- L2 emergency pause control is available and policy mode is readable.
- L3 messaging rate limits are enabled (`windowMs=1000`, `max=20`).
- Manual finalization path is relayer-only (`execution reverted: not relayer` for non-relayer simulation).
- Consensus smoke remains passing (`exit_code=0`).
- Postflight regression also passes for proposer and node hygiene checks, and L3 parent bridge/messenger wiring drift has been remediated to PASS.

## Re-run commands
- `infra/opstack/scripts/validate-fault-safety-controls.sh`
- `scripts/smoke/consensus-autonomy.sh`
