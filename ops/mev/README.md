# MEV / Sequencer Manipulation Monitoring

This directory contains a deterministic, read-only MEV monitor that scans recent blocks for ordering anomalies.

Artifacts (generated at runtime):
- `mev-report.json`

Configuration:
- `mev-monitor-config.json`

Run:
```
./ops/mev/mev-monitor.sh --mode prod --snapshot ./ops/docker/snapshots/<timestamp>
```

CRITICAL severity triggers the kill switch when invoked by `ghostctl-recreate.sh`.
