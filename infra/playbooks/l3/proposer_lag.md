# L3 Proposer Lag

## Detection signals
- AI monitor incident: `proposer_stalled` or `proposer_metrics_unreachable`.
- Prometheus: `time() - op_proposer_default_txmgr_last_publish_unix` exceeds threshold.
- `infra/scripts/doctor-l3.sh` warns about proposer metrics.

## Immediate mitigation
1. Check proposer container state:
   - `docker compose -f infra/opstack/docker-compose.yml -f infra/opstack/docker-compose.l3.yml ps l3-op-proposer`
2. Restart proposer:
   - `docker compose -f infra/opstack/docker-compose.yml -f infra/opstack/docker-compose.l3.yml up -d l3-op-proposer`
3. Confirm metrics endpoint:
   - `curl -fsS http://localhost:8302/metrics | head -n 5`

## Permanent fix
- Validate `L3_PROPOSER_KEY` presence (Vault or dev secrets).
- Verify parent RPC reachability (`L3_L1_RPC`).
- Check `L3_GAME_FACTORY_ADDRESS` and rollup config for L2 alignment.

## Verification
- `bash infra/scripts/doctor-l3.sh`
- `curl -fsS http://localhost:8302/metrics | rg -n "last_publish"`
