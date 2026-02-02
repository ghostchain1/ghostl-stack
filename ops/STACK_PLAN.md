# GhostChain Stack Plan (Sequential, Non-Destructive)

## Scope
This plan wires config and verification tooling without disrupting running containers. No chain data volumes are touched. Each step is reversible via `ops/scripts/rollback.sh` using a config snapshot created by `ops/scripts/snapshot.sh`.

## Step 0 — Read-only preflight
- Run `ops/scripts/preflight.sh` to capture runtime state, compose files, and health hints.
- Check for restarting containers and port drift.
- **Checkpoint:** All data captured under `ops/preflight/<timestamp>`.
- **Rollback:** Not required (read-only).

## Step 1 — Canonical config normalization (no runtime changes)
- Review and update `ops/STACK_CANONICAL.yml` from latest preflight.
- Ensure endpoint matrix is correct for L1/L2/L3.
- **Checkpoint:** `ops/STACK_CANONICAL.yml` committed.
- **Rollback:** Not required (config file only).

## Step 2 — Add/repair healthchecks (no service restarts yet)
- Update compose files only where healthchecks are missing.
- Keep ports and service names unchanged.
- **Checkpoint:** `docker compose -f <file> config` passes.
- **Rollback:** `ops/scripts/rollback.sh <snapshot>`.

## Step 3 — Observability wiring (optional)
- If Prometheus/Grafana/Loki are required, start only those services.
- **Checkpoint:** `/metrics` and Grafana reachable; targets healthy.
- **Rollback:** `docker compose up -d --no-deps <obs-service>` using snapshot configs.

## Step 4 — UI config + status page
- Centralize endpoints in a single config module.
- Add `/api/status` and `/connection-status` for live checks.
- **Checkpoint:** UI loads and status endpoint returns data.
- **Rollback:** `ops/scripts/rollback.sh <snapshot>`.

## Step 5 — Fix miswired dependencies (one service at a time)
- Apply one service fix, then verify.
- **Checkpoint:** `ops/scripts/verify.sh` passes for affected services.
- **Rollback:** `ops/scripts/rollback.sh <snapshot>`.

## Step 6 — Chain service fixes (last, only if required)
- Only touch L2/L3 components one at a time; keep volumes intact.
- **Checkpoint:** RPC chainId + block height monotonic.
- **Rollback:** `ops/scripts/rollback.sh <snapshot>`.

## Step 7 — Final verify
- Run `ops/scripts/verify.sh` end-to-end.
- **Checkpoint:** All required checks pass.

## Step 8 — Release engineering (L1)
- Use the Phase 8 release flow to tag, generate evidence, and run smoke tests:
  - `infra/scripts/release-l1.sh --mode=staging --tag=l1-<version>`
  - `infra/scripts/rollback-l1.sh --mode=staging --tag=l1-<previous>`
- Run `infra/scripts/evidence-pack-l1.sh` after any production change.
- **Checkpoint:** `doctor-l1.sh` passes with `L1_MODE=staging` or `production`.

## Change Log
- 2026-01-23: Added centralized endpoint resolvers, `/api/status`, `/connection-status`, and Playwright coverage for status page.
