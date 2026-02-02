# L2 Batcher Down

## Detection signals
- `op-batcher` container unhealthy or stopped.
- Prometheus: `op_batcher_default_up == 0` or `OpBatcherIdle` alert.
- `infra/scripts/doctor-l2.sh` warns/fails when `L2_REQUIRE_L2_PROGRESS=1`.

## Immediate mitigation
1. Check container state:
   - `docker compose -f infra/opstack/docker-compose.yml ps op-batcher`
2. Restart batcher:
   - `docker compose -f infra/opstack/docker-compose.yml up -d op-batcher`
3. Confirm metrics endpoint:
   - `curl -fsS http://localhost:7301/metrics | head -n 5`

## Permanent fix
- Validate batcher key and L1 RPC connectivity:
  - Ensure `BATCHER_KEY` present in `infra/opstack/.env.secrets` (dev) or Vault.
  - Ensure `HOST_L1_RPC` reachable and `op-gate-l1` healthy.
- Check batcher logs for tx errors or nonce issues:
  - `docker compose -f infra/opstack/docker-compose.yml logs --tail=200 op-batcher`

## Verification
- `bash infra/scripts/doctor-l2.sh`
- `curl -fsS http://localhost:7301/metrics | rg -n "op_batcher_default_up"`
