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
- `docker-compose.eth.yml` — default geth PoA stack (bootnode + node1 + node2)
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
