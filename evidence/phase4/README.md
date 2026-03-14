# Phase 4 Evidence Index

Generated: 2026-02-21

## Files
- `compose-hardening-check.txt` — Compose security controls (`user`, `cap_drop`, `no-new-privileges`, `read_only`, `tmpfs`) for autonomy stack.
- `dockerfile-user-check.txt` — Dockerfile non-root checks for `network-manager-service` and `consensus-telemetry-service`.
- `prod-lock-check.txt` — Runtime production lock references in network manager execution path.
- `smoke-consensus-autonomy.txt` — Smoke gate run (syntax + consensus telemetry tests).
- `chaos-script-check.txt` — Chaos script syntax validation.
- `rollback-script-check.txt` — Rollback script syntax validation.
- `rollback-backup.txt` — Executed rollback snapshot backup.
- `rollback-list.txt` — Snapshot list after backup.
- `provenance-script-check.txt` — Provenance build script syntax validation.
- `provenance-build.log` — Provenance image build output.
- `provenance-build-status.txt` — Provenance generation pass/fail status.

## Gate-relevant pointers
- Container hardening controls present: `compose-hardening-check.txt`, `dockerfile-user-check.txt`.
- Prod execution lock present: `prod-lock-check.txt`.
- Smoke gate pass: `smoke-consensus-autonomy.txt`.
- Chaos + rollback tooling validated: `chaos-script-check.txt`, `rollback-script-check.txt`, `rollback-backup.txt`.
- Build provenance generated: `provenance-build-status.txt` and `ops/reports/provenance/network-manager-service-20260221-184238.json`.
