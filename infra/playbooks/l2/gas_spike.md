# L2 Gas Spike

## Detection signals
- L2 base fee spikes or gas spike alert from ai-monitor.
- Prometheus or ghost-gas-engine policy violations.

## Immediate mitigation
1. Inspect gas-engine policy state:
   - `curl -fsS http://localhost:3210/policies | head -n 40`
2. If allowed by policy, enable throttling:
   - Reduce batcher submission rate (temporary): update `OP_BATCHER_POLL_INTERVAL` and restart.

## Permanent fix
- Propose fee policy update through governance (no manual changes in production).
- Review gas token enforcement and base fee config in L1 `SystemConfigProxy`.

## Verification
- `curl -fsS http://localhost:3210/gas | head -n 40`
- `bash infra/scripts/doctor-l2.sh`
