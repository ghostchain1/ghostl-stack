# L3 Parent RPC Down (L2)

## Detection signals
- AI monitor incident: `l3_parent_rpc_unreachable` or `l3_parent_head_stale`.
- `infra/scripts/doctor-l3.sh` fails parent RPC checks.
- op-node logs report derivation errors.

## Immediate mitigation
1. Validate L2 RPC/proxy health:
   - `curl -fsS http://localhost:9545 | head -n 5`
2. Check op-node health:
   - `docker compose -f infra/opstack/docker-compose.yml -f infra/opstack/docker-compose.l3.yml ps l3-op-node`
3. Restart L3 op-node if it is stuck:
   - `docker compose -f infra/opstack/docker-compose.yml -f infra/opstack/docker-compose.l3.yml up -d l3-op-node`

## Permanent fix
- Ensure L2 stack is healthy (batcher/proposer running).
- Verify `L3_L1_RPC` points to L2 RPC proxy and is reachable.
- Review firewall rules or DNS changes affecting L2 RPC.

## Verification
- `bash infra/scripts/doctor-l3.sh`
- `curl -fsS http://localhost:8300/metrics | head -n 5`
