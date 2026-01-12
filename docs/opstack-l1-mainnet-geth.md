# L1 Mainnet Geth (Full/Snap Sync) in Docker

This overlay runs a mainnet geth node as “Ghost Layer 1” instead of the bundled dev L1. It exposes RPCs on host ports for the rest of the stack.

## Compose overlay

File: `infra/opstack/docker-compose.mainnet-geth.yml`

Service `l1-mainnet-geth`:
- Image: `ethereum/client-go:stable`
- Ports (host → container):
  - `38545:8545` HTTP
  - `38546:8546` WebSocket
  - `38551:8551` AuthRPC
  - `38660:6060` Metrics
- Data volume: `l1-mainnet-geth-data` at `/data`
- Sync mode: snap (full chain, faster than full historical)

## Run

```bash
docker compose \
  -f infra/opstack/docker-compose.yml \
  -f infra/opstack/docker-compose.mainnet-geth.yml \
  up -d l1-mainnet-geth
```

Check sync:
```bash
cast rpc --rpc-url http://127.0.0.1:38545 eth_syncing
cast block-number --rpc-url http://127.0.0.1:38545
```

## Wire the stack to mainnet L1

Update your envs to point at the host-exposed mainnet RPC:
- `infra/opstack/.env`:
  - `L1_RPC=http://l1-mainnet-geth:8545` (inside compose network)
  - `HOST_L1_RPC=http://localhost:38545`
  - `L1_CHAIN_ID=1`
- If L3 uses L1 directly anywhere, mirror `PARENT_L1_RPC` to `http://localhost:38545`.

Restart the stack after updating envs so L2/L3 pick up the new L1 RPC.

## Notes

- Mainnet sync (snap) still takes time; initial catch-up can be hours+ depending on disk/network. Ensure enough disk (hundreds of GB) and memory (recommended ≥8 GB).
- Ports are offset from the dev L1 to avoid clashes. Adjust as needed.
- For a lighter approach, use a mainnet fork (Anvil) instead; this overlay is for a persistent full mainnet mirror.
