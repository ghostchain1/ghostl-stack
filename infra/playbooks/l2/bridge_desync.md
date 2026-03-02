# L1/L2 Bridge Desync

## Detection signals
- Bridge-related errors in op-node/op-batcher logs.
- Contract code missing at bridge addresses in `doctor-l2.sh`.
- L1 standard bridge/messenger events not relayed.

## Immediate mitigation
1. Verify bridge addresses:
   - `cat infra/opstack/config/l1-deployments.json`
2. Check L1 contract code:
   - `cast code <L1_STANDARD_BRIDGE_ADDRESS> --rpc-url http://localhost:18545`
   - `cast code <L1_CROSS_DOMAIN_MESSENGER_ADDRESS> --rpc-url http://localhost:18545`
3. Restart relevant services:
   - `docker compose -f infra/opstack/docker-compose.yml up -d op-node op-batcher op-proposer`

## Permanent fix
- Ensure deployments JSON files are updated after any L1 redeploys.
- Validate rollup config and `SystemConfigProxy` references.
- If using FUT bridge/router, ensure `.env` points to the FUT addresses.

## Verification
- `bash infra/scripts/doctor-l2.sh`
- Monitor bridge events via L1 RPC logs or block explorer.
