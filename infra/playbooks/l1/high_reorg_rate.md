# L1 Playbook: High Reorg Rate

## Detection signals
- `ai_monitor_reorgs_total` increasing rapidly
- `ai_monitor_incident_active{type="reorg_detected"} == 1`

## Immediate mitigation
1. Reduce risk exposure: enable delay via guard (if allowed).
2. Check validator peers and latency.

## Permanent fix
- Inspect validator health and network partitions.
- Ensure stable clock sync and P2P connectivity.

## Verification
- `curl -s http://localhost:7576/status`
- Observe `ai_monitor_reorgs_total` stabilizing.
