# L1 Playbook: Validator Down

## Detection signals
- `net_peerCount` drops and `ai_monitor_incident_active{type="low_peers"} == 1`
- Validator logs missing expected block production

## Immediate mitigation
1. Restart node container:
   - `docker compose -f infra/ghostchain/docker-compose.l1.yml restart ghostchain-node1`
2. Check key permissions and datadir ownership (UID 1000).

## Permanent fix
- Verify validator key integrity in `infra/ghostchain/geth/keys`.
- Ensure bootnode reachable and P2P port open.

## Verification
- `bash infra/scripts/doctor-l1.sh`
- `curl -s http://localhost:18545/health`
