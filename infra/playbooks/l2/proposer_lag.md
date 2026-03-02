# L2 Proposer Lag

## Detection signals
- Prometheus: `OpProposerIdle` alert or `op_proposer_default_txmgr_last_publish_unix` stale.
- Outputs not advancing on L1 (L2OutputOracle).

## Immediate mitigation
1. Check proposer health:
   - `docker compose -f infra/opstack/docker-compose.yml ps op-proposer`
2. Restart proposer:
   - `docker compose -f infra/opstack/docker-compose.yml up -d op-proposer`
3. Confirm metrics:
   - `curl -fsS http://localhost:7302/metrics | head -n 5`

## Permanent fix
- Validate proposer key and L1 RPC:
  - Ensure `PROPOSER_KEY` present in `infra/opstack/.env.secrets` (dev) or Vault.
  - Verify `op-gate-l1` health and L1 RPC connectivity.
- Check L2OO address correctness in `infra/opstack/.env`.
- Review logs for tx failures or nonce conflicts:
  - `docker compose -f infra/opstack/docker-compose.yml logs --tail=200 op-proposer`

## Verification
- `bash infra/scripts/doctor-l2.sh`
- `curl -fsS http://localhost:7302/metrics | rg -n "op_proposer_default_txmgr_last_publish_unix"`
