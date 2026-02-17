# GhostControl Systemd Units

This directory contains host-level `systemd` units for the GhostControl event watchdog.

## Install

From repo root:

```bash
bash tools/ghostcontrol/infra/systemd/install_event_watchdog_service.sh
```

## Live-Fire Drill

Run an end-to-end watchdog resilience drill (with automatic drop-in restore):

```bash
bash tools/ghostcontrol/infra/systemd/livefire_watchdog_recovery_drill.sh
```

## Managed units

- `ghostcontrol-event-watchdog.service`
- `ghostcontrol-event-watchdog-healthcheck.service`
- `ghostcontrol-event-watchdog-healthcheck.timer`
- `ghostcontrol-event-watchdog-recovery.service` (auto-runs on healthcheck failure)
- `livefire_watchdog_recovery_drill.sh` (manual validation script)

## Runtime outputs

- Watchdog log: `tools/ghostcontrol/evidence/logs/event-watchdog.log`
- Healthcheck log: `tools/ghostcontrol/evidence/logs/event-watchdog-health.log`
- Recovery log: `tools/ghostcontrol/evidence/logs/event-watchdog-recovery.log`
- Recovery artifacts: `tools/ghostcontrol/evidence/logs/event-watchdog-recovery-*.json`
- Live-fire summary: `tools/ghostcontrol/evidence/logs/event-watchdog-livefire-*.json`
- Heartbeat status: `tools/ghostcontrol/evidence/logs/event-watchdog.status.json`
