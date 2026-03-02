# L3 Batcher Idle

## Detection signals
- AI monitor incident: `batcher_stalled` or `batcher_metrics_unreachable`.
- Prometheus: `time() - op_batcher_default_last_batcher_tx_unix` exceeds threshold.
- `infra/scripts/doctor-l3.sh` warns about batcher idle.

## Immediate mitigation
1. Check batcher container:
   - `docker compose -f infra/opstack/docker-compose.yml -f infra/opstack/docker-compose.l3.yml ps l3-op-batcher`
2. Restart batcher:
   - `docker compose -f infra/opstack/docker-compose.yml -f infra/opstack/docker-compose.l3.yml up -d l3-op-batcher`
3. Confirm metrics endpoint:
   - `curl -fsS http://localhost:8301/metrics | head -n 5`

## Permanent fix
- Verify `L3_BATCHER_KEY` availability and correct funding.
- Ensure parent RPC (`L3_L1_RPC`) and rollup RPC reachable.
- Check for nonce or fee errors in batcher logs.

## Verification
- `bash infra/scripts/doctor-l3.sh`
- `curl -fsS http://localhost:8301/metrics | rg -n "last_batcher_tx"`
