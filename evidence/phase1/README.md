# Phase 1 Evidence Index

Generated: 2026-02-21

## Files
- `compose-validation.txt` — pass/fail summary for hardened compose targets.
- `compose-root-dev.config.log` — `docker compose config -q` output for root dev compose.
- `compose-apps-dev.config.log` — `docker compose config -q` output for apps dev compose.
- `compose-ghostcontrol.config.log` — `docker compose config -q` output for ghostcontrol compose.
- `ghostcontrol-cli-help.txt` — CLI command surface output.
- `ghostcontrol-status.txt` — runtime status snapshot from ghostcontrol compose.
- `ghostcontrol-doctor.log` — doctor checks with PASS/FAIL lines and final status.
- `ghostcontrol-doctor.stdout.log` — captured stdout from doctor invocation.
- `ghostcontrol-backup.stdout.log` — backup execution output.
- `backups/` — generated backup artifacts.

## Gate-relevant pointers
- Doctor gate status: see `ghostcontrol-doctor.log` (`DOCTOR_STATUS=PASS`).
- Compose gate status: see `compose-validation.txt` (all target files PASS).
