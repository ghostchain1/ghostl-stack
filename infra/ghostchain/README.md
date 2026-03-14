# GhostChain (EVM-compatible, config-only geth)

This folder runs GhostChain (the main Autonomous Layer 1 blockchain) as a clique PoA chain on stock geth (no forked client). It ships with bootnode + 2 signers, deterministic keys, and helper scripts.

## Run it
```bash
cd infra/ghostchain
bash ../scripts/env-sync-l1.sh  # validate env + render derived .env
bash scripts/up.sh          # init keys/datadirs + start bootnode + 2 geth nodes
bash scripts/health.sh      # quick RPC checks (chainId, blockNumber, peers)
# Explorer (GhostScout) on http://localhost:18640 once up.sh has started the stack
# Stop:
bash scripts/down.sh
```

RPC/ports (node1 exposed):
- HTTP (via proxy): `http://localhost:18545`
- WS:   `ws://localhost:18546`
- AuthRPC: `http://localhost:18552`
- P2P: `18551`
- Metrics: `http://localhost:18660/debug/metrics`

RPC hardening:
- HTTP RPC is routed through `ghostchain-rpc-proxy` with rate limits and optional auth.
- Configure CORS/WS origins via `.env.l1` (`L1_HTTP_CORS`, `L1_WS_ORIGINS`, `L1_HTTP_VHOSTS`).
- Enable auth for sensitive RPC methods with `L1_RPC_AUTH_TOKEN` + `L1_RPC_REQUIRE_AUTH=1`.

Chain config:
- Chain ID: `14000101` (set in `geth/genesis.json`)
- Consensus: clique PoA (2s period, signers `0xf39f…2266` and `0x7099…c79c8`)
- Prefunded dev keys: see `geth/keys/*`
- Genesis: `geth/genesis.json` (London on, Shanghai/Cancun pushed far out to avoid clique blob/withdrawal edge cases)

Compose files:
- `docker-compose.l1.yml` — default geth PoA stack (bootnode + node1 + node2)
- `docker-compose.ibft.yml` — legacy Besu IBFT (kept for reference; stopped by default)
- GhostScout explorer is included (Blockscout) + Postgres DB

Playbooks:
- `infra/playbooks/l1/rpc_unreachable.md`
- `infra/playbooks/l1/disk_full.md`
- `infra/playbooks/l1/high_reorg_rate.md`
- `infra/playbooks/l1/validator_down.md`
- `infra/playbooks/l1/metrics_missing.md`
- `infra/playbooks/l1/vault_seal.md`

## Quick tx with cast (optional)
Requires Foundry’s `cast`:
```bash
cast send 0x0000000000000000000000000000000000000000 \
  --rpc-url http://localhost:18545 \
  --from 0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266 \
  --private-key $(cat geth/keys/node1.key) \
  --value 0
```

## Notes / resets
- Datadirs live under `data/bootnode`, `data/node1`, `data/node2`. Remove them to reset the chain, then rerun `scripts/up.sh`.
- If other stacks (L2/L3) pointed at the old IBFT chain, stop them, reset their datadirs, and redeploy contracts against this geth chain.
- Containers run as UID 1000. If the stack fails to start with permission errors, ensure datadirs are owned by UID 1000 and use 700/600 perms.
- L1 metrics are exposed on `http://localhost:18660/debug/metrics`; Prometheus scrape config lives in `observability/infra/prometheus.yml`.
- L1 env is canonicalized in `infra/ghostchain/.env.l1` (copy from `.env.l1.example`).

---

## OP Stack → Cosmos SDK Migration: Full Topology

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ghostchaind   Cosmos SDK sovereign (ChainID: ghostchain-1, denom: ugst)│
│   CometBFT     Ports: 26657 (RPC) | 9090 (gRPC) | 1317 (LCD) | 26656  │
│       ↕ IBC (Hermes — config/hermes.toml)                               │
│  ghostchain-node1  geth PoA EVM L1 (ChainID: 14000101, port 18545)      │
│       ↕ OP Stack settlement                                             │
│  OP Stack L2  (ChainID: 901, port 29547)                                │
│       ↕ OP Stack                                                        │
│  OP Stack L3  (ChainID: 903, port 39545)                                │
│                                                                         │
│  governance-event-bridge polls ghostchaind LCD :1317 every 12 s        │
│  Hermes relays ICS-20 packets between ghostchain-1 and EVM chains       │
└─────────────────────────────────────────────────────────────────────────┘
```

### Compose files

| File | Purpose |
|------|---------|
| `docker-compose.l1.yml` | EVM geth PoA L1 stack (bootnode + node1 + node2 + rpc-proxy) |
| `docker-compose.cosmos.yml` | Cosmos SDK sovereign node + Hermes IBC relayer |
| `docker-compose.ibft.yml` | Legacy Besu IBFT (kept for reference, stopped by default) |
| `../../docker-compose.ghostchain.yml` | Primary Cosmos SDK node (root-level, canonical) |
| `../../docker-compose.ghostbrain.yml` | AI brain stack; governance-event-bridge wired to Cosmos LCD |

### Start Cosmos SDK sovereign node

```bash
# From workspace root — creates ghostchain-cosmos-net Docker network:
docker compose -f docker-compose.ghostchain.yml --env-file stack.env up -d

# Verify blocks are being produced:
curl http://localhost:26657/status | jq .result.sync_info.latest_block_height

# Query GhostGov proposals via LCD:
curl http://localhost:1317/ghostchain/ghostgov/v1/proposals
```

### Wire ghostbrain AI stack to Cosmos

```bash
# Cosmos node must be running first (governs ghostchain-cosmos-net network):
docker compose -f docker-compose.ghostchain.yml --env-file stack.env up -d

# governance-event-bridge will auto-connect to http://ghostchaind:1317:
docker compose -f docker-compose.ghostbrain.yml --env-file stack.env up -d
```

### IBC Hermes relayer quick-start

```bash
# Add relayer key:
docker exec hermes-relayer \
  hermes keys add --chain ghostchain-1 \
  --mnemonic-file /run/secrets/ghostchain-relayer-mnemonic

# Start with IBC profile:
docker compose -f docker-compose.ghostchain.yml --profile ibc --env-file stack.env up -d

# Run health check:
docker exec hermes-relayer hermes health-check
```

Cosmos SDK chain data lives in Docker volume `ghostchaind-data`. Delete it to reset genesis.
