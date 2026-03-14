# Drift Monitoring (Read-Only)

This directory contains the continual drift monitor for chain-state invariants and RPC health.

Artifacts (generated at runtime):
- `baseline.json`
- `drift-report.json`

Configuration:
- `drift-policy.json`

Drift types reported:
- `DATA`
- `BEHAVIOR`
- `PERFORMANCE`

Run manually:
```
./ops/ai/drift/monitor.sh --mode prod --snapshot ./ops/docker/snapshots/<timestamp>
```

If `DRIFT_KILL_SWITCH=true` and a CRITICAL drift is detected, the kill switch is activated.
