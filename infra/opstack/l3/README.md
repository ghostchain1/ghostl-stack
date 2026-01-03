# OP Stack L3 Scaffold (GhostL3 on GhostL2)

Template overlay to spin up an OP Stack L3 that settles on GhostL2. Use it as a starting point; replace contract addresses in the generated configs before production use.

## Create a new L3 skeleton
```bash
bash infra/scripts/opstack/l3/new.sh ghostpay --chain-id 1101 --host-rpc-port 49545
```

Outputs:
- Config + data dirs under `infra/opstack/l3/<name>/`
- `.env` with port/chain IDs for the compose overlay

## Run the L3 alongside L2
```bash
docker compose -f infra/opstack/docker-compose.yml -f infra/opstack/docker-compose.l3.yml \
  --env-file infra/opstack/l3/ghostpay/.env \
  up -d l3-geth l3-op-node l3-op-batcher l3-op-proposer
```

Defaults:
- Settlement RPC: `http://l2-geth:8545`
- Host ports: RPC `39545`, rollup RPC `39546`, batcher `39551`, proposer `39560`
- Metrics: `8300/8301/8302`

⚠️ The generated `rollup.json` and `genesis.json` keep placeholder contract addresses from the L2 template; update them with your L3 deployments before relying on the chain.
