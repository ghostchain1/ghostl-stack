# Phase 0 — Baseline Report

Date: 2026-02-21

## Goal
Establish a verified, non-breaking baseline of the current GhostStack state before hardening and phased rollout work.

## What was executed
1. Inventory of services, compose files, env/secrets-like files.
2. Dependency map for UI/API/services/chains and settlement path.
3. Baseline checks:
   - `docker compose config -q` on core compose entry points.
   - Runtime container health snapshot (`docker ps`).
   - RPC sanity (`eth_blockNumber`) for L1/L2/L3 endpoints.
   - Build status for `apps/api` and `apps/web`.

## Baseline results

### 1) Compose validation
- PASS: `14/17` targets
- FAIL: `3/17` targets

Failed compose targets:
- `docker-compose.phase3.secrets.yml`
  - Error: service `ghost-relayer` has neither `image` nor `build` specified.
- `infra/opstack/docker-compose.l3.yml`
  - Error: service `consensus-telemetry-service` depends on undefined service `l2-geth`.
- `infra/opstack/docker-compose.challengers.yml`
  - Error: service `l3-op-challenger` depends on undefined service `l3-op-node`.

### 2) Runtime health snapshot
- Active containers are present across chain, services, and observability stacks.
- Most services report `healthy` in docker status.
- Snapshot recorded in `evidence/phase0/docker-ps.txt`.

### 3) Chain RPC sanity
- L1 (`:18545`): PASS
- L2 (`:29547`): PASS
- L3 (`:39545`): PASS

All three endpoints returned valid JSON-RPC responses for `eth_blockNumber`.

### 4) Build status
- `build:api` → exit `0` (PASS)
- `build:web` → exit `1` (FAIL)
- Web failure detail: ESLint circular JSON/config resolution issue referencing `apps/web/.eslintrc.json` during `next build` lint/type-check stage.

## Gate 0 assessment
Gate rule: no failing builds in baseline, or documented exceptions with tickets.

Current status: **CONDITIONAL PASS (with documented exceptions)**

Documented exceptions for follow-up:
1. Compose config failures (3 files listed above).
2. `apps/web` production build failure due to ESLint config resolution.

## Required outputs delivered
- Baseline report: `docs/baseline-report.md`
- Architecture map: `docs/architecture.mmd`
- Service catalog: `docs/service-catalog.md`
- Evidence pack: `evidence/phase0/*`

## Evidence pack contents (Phase 0)
- `evidence/phase0/inventory.txt`
- `evidence/phase0/compose-files.txt`
- `evidence/phase0/env-and-secrets-files.txt`
- `evidence/phase0/compose-targets.txt`
- `evidence/phase0/compose-config-results.txt`
- `evidence/phase0/compose-config-errors.txt`
- `evidence/phase0/docker-ps.txt`
- `evidence/phase0/rpc-sanity.txt`
- `evidence/phase0/build-api.log`
- `evidence/phase0/build-web.log`
- `evidence/phase0/build-status.txt`
- `evidence/phase0/baseline-checks.log`
