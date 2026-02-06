# L1 Playbook: RPC Unreachable

## Detection signals
- `ai_monitor_incident_active{type="rpc_unreachable"} == 1`
- `ghost_rpc_proxy_rate_limited_total` increasing with 5xx on RPC
- `doctor-l1.sh` fails at RPC checks

## Immediate mitigation
1. Check proxy health: `curl -s http://localhost:18545/health`
2. Restart proxy and node1:
   - `docker compose -f infra/ghostchain/docker-compose.l1.yml up -d --build ghostchain-rpc-proxy`
   - `docker compose -f infra/ghostchain/docker-compose.l1.yml restart ghostchain-node1`

## Permanent fix
- Verify CORS/vhosts in `.env.l1` and regenerate `.env` via `env-sync-l1.sh`.
- Ensure host firewall allows `18545/18546/18551`.

## Verification
- `bash infra/scripts/doctor-l1.sh`
- `curl -s http://localhost:18545/health`
