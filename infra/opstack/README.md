# GhostChain OP Stack Devnet

OP Stack L2 (GhostL2) devnet that aligns with the GhostChain blueprint: Optimistic now, hybrid OP + ZK later, with AI Guard/Relayer hooks on top.

## What runs
- L1: Anvil (host port `28545`)
- L2: op-geth + op-node + op-batcher + op-proposer (host port `29545`)
- `op-gate` JSON-RPC proxy sits in front of L1 for batcher/proposer and can be driven by Ghost Guard (metrics on `28546/metrics/prom`).
- Containers use `local/op-*` images built from the vendored Optimism sources.

## Quickstart
```bash
# 1) Build images (one-time, takes a few minutes)
#    OPSTACK_IMAGE_TAG=devnet is used for all local/op-* images.
bash infra/scripts/opstack/build.sh

# Build op-gate image (bakes deps, runs as non-root)
docker build -t ${OP_GATE_IMAGE:-local/op-gate:0.1.0} -f infra/opstack/gate/Dockerfile infra/opstack/gate

# 2) Configure env/keys (keep secrets in .env.secrets)
cp infra/opstack/.env.sample infra/opstack/.env            # non-secret config
cp infra/opstack/.env.secrets.sample infra/opstack/.env.secrets  # keys; do not commit
bash infra/scripts/opstack/keys/init.sh                     # regenerates keys/addresses
# Optional: point GATE_GUARD_URL at your Ghost Guard instance (default host:7070).

# 3) Start devnet
bash infra/scripts/opstack/up.sh -- --env-file .env --env-file .env.secrets
# L1 RPC: http://localhost:28545
# L2 RPC: http://localhost:29545

# 4) Deploy contracts to OP L2 and emit service env files
bash infra/scripts/opstack/deploy.sh
# Gate: `op-batcher` / `op-proposer` point at `op-gate` (host `28546`) for Guard-aware pause/delay/deny.

# Optional: start observability (Prometheus + Grafana) in a separate shell
docker compose --env-file infra/opstack/.env --env-file infra/opstack/.env.secrets \
  -f infra/opstack/docker-compose.yml --profile observability up -d prometheus grafana
```

## Reset
```bash
bash infra/scripts/opstack/reset.sh
```

## Notes
- `contracts/hardhat.config.ts` already contains `ghostl2Op` / `ghostl3Op` networks; `infra/scripts/opstack/deploy.sh` targets `ghostl2Op`.
- `.env.sample` includes host/internal RPCs and chain IDs; `keys/init.sh` refreshes keys and fills corresponding addresses.
- L3 is reserved for the upcoming OP Stack app-chain on GhostL2 (host RPC placeholder `39545`).
- L3 guard defaults are now fail-closed (`L3_GUARD_FAIL_OPEN=false` by default).
- Healthchecks gate startup ordering; if you tweak ports, update the compose healthchecks accordingly.
