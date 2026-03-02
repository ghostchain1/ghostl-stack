# L2 Output Oracle Stalled

## Detection signals
- L1 `L2OutputOracleProxy` output index not changing.
- Proposer metrics show no publish activity.
- `doctor-l2.sh` warns about proposer idle when `L2_REQUIRE_L2_PROGRESS=1`.

## Immediate mitigation
1. Restart proposer:
   - `docker compose -f infra/opstack/docker-compose.yml up -d op-proposer`
2. Verify L2OO address in `infra/opstack/config/l1-deployments.json` and `.env`.

## Permanent fix
- Verify proposer key and gas funding on L1.
- Check L1 RPC stability and `op-gate-l1` health.
- Confirm L2OO contract exists on L1:
  - `cast code <L2OO_ADDRESS> --rpc-url http://localhost:18545`

## Verification
- `curl -fsS http://localhost:7302/metrics | rg -n "op_proposer_default_txmgr_last_publish_unix"`
- `bash infra/scripts/doctor-l2.sh`
