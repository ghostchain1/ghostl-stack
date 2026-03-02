# L3 Oracle Missing or Wrong

## Detection signals
- AI monitor incident: `op_node_unreachable` or `l3_parent_head_stale` with no outputs.
- Proposer metrics idle beyond threshold.
- `infra/scripts/doctor-l3.sh` warns on L2 contract bytecode or rollup config mismatch.

## Immediate mitigation
1. Confirm proposer is running:
   - `docker compose -f infra/opstack/docker-compose.yml -f infra/opstack/docker-compose.l3.yml ps l3-op-proposer`
2. Check proposer logs:
   - `docker compose -f infra/opstack/docker-compose.yml -f infra/opstack/docker-compose.l3.yml logs --tail=200 l3-op-proposer`
3. Validate parent RPC:
   - `curl -fsS http://localhost:19546 | head -n 5` (op-node rollup RPC)

## Permanent fix
- Verify `L3_GAME_FACTORY_ADDRESS` and L2 contract deployments in `infra/opstack/.env.l3`.
- Ensure L3 rollup config points to the correct L2 portal and SystemConfig.
- Redeploy contracts on L2 only if you have governance approval.

## Verification
- `bash infra/scripts/doctor-l3.sh`
- `curl -fsS http://localhost:8302/metrics | rg -n "last_publish"`
