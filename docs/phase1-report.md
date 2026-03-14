# Phase 1 — Deployment Standardization + Observability Report

Date: 2026-02-21

## Goal
Increase operability and stability through compose hardening, observability validation, and a command entrypoint for day-2 operations.

## Plan executed
1. Harden active development compose files with restart and health settings.
2. Harden GhostControl compose runtime behavior for long-running services.
3. Add GhostControl CLI skeleton (`up/down/status/logs/doctor/backup/restore`).
4. Run compose validation and doctor checks; capture evidence under `evidence/phase1`.

## Diff-only changes applied

### Compose hardening
- Updated `docker-compose.dev.yml`:
  - Added `init: true`, `restart: unless-stopped`, and healthchecks for `ghostl-api` and `ghostl-web`.
- Updated `apps/docker-compose.dev.yml`:
  - Added `init: true`, `restart: unless-stopped`, and healthchecks for `ghostl-api` and `ghostl-web`.
  - Added `init: true`, `restart: unless-stopped` for `ghostl-worker`.
- Updated `tools/ghostcontrol/infra/compose/docker-compose.yml`:
  - Added `restart: unless-stopped` for long-running services (`ghostcontrol-ui`, `ghostcontrol-api`, `ghostcontrol-policy`, `ghostcontrol-planner`, `ghostcontrol-ingest`, `ghostcontrol-runner`, `docker-socket-proxy`, `ghostcontrol-db`, `ghostcontrol-redis`).

### GhostControl CLI skeleton
- Added `tools/ghostcontrol/bin/ghostcontrol.sh` with commands:
  - `up`, `down`, `status`, `logs`, `doctor`, `backup`, `restore`
- Updated `tools/ghostcontrol/package.json` scripts:
  - `cli`, `status`, `logs`, `doctor`, `backup`, `restore`
- Updated docs:
  - `tools/ghostcontrol/README.md`
  - `tools/ghostcontrol/docs/usage.md`

## Validation and evidence

### Compose config validation
- PASS `docker-compose.dev.yml`
- PASS `apps/docker-compose.dev.yml`
- PASS `tools/ghostcontrol/infra/compose/docker-compose.yml`

Evidence: `evidence/phase1/compose-validation.txt`

### GhostControl doctor
- `DOCTOR_STATUS=PASS`
- API/UI/Prometheus/Grafana health probes passed
- L1/L2/L3 RPC probes passed

Evidence:
- `evidence/phase1/ghostcontrol-doctor.log`
- `evidence/phase1/ghostcontrol-doctor.stdout.log`

### Backup/restore command surface
- Backup command executed and produced an archive.

Evidence:
- `evidence/phase1/ghostcontrol-backup.stdout.log`
- `evidence/phase1/backups/`

## Gate 1 assessment
Gate 1 requires:
1. one-command boot yields all containers healthy
2. Grafana shows chain + system dashboards
3. `ghostcontrol doctor` returns PASS (or explicit FAIL)

Status: **CONDITIONAL PASS**

- Satisfied:
  - Compose hardening applied to target dev stacks.
  - `ghostcontrol doctor` returns PASS with evidence.
  - Compose configs for hardened targets validate.
- Deferred/documented:
  - Full end-to-end validation that every stack container is healthy from a single root boot command is not yet recorded in Phase 1 evidence.
  - Visual dashboard content assertion (chain + system panels rendered) is not yet screenshot-verified in this phase artifact.

## Outputs for this phase
- Report: `docs/phase1-report.md`
- Evidence: `evidence/phase1/*`
- CLI: `tools/ghostcontrol/bin/ghostcontrol.sh`
