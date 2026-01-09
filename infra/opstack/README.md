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

## L2 + L3 stack and challengers
- Combined run: `docker compose --env-file infra/opstack/.env --env-file infra/opstack/.env.secrets -f infra/opstack/docker-compose.yml -f infra/opstack/docker-compose.l3.yml up -d l1 op-gate l2-geth op-node op-batcher op-proposer l3-geth l3-op-node l3-op-batcher l3-op-proposer`
- Challengers overlay (optional): `docker compose --env-file infra/opstack/.env --env-file infra/opstack/.env.secrets -f infra/opstack/docker-compose.yml -f infra/opstack/docker-compose.l3.yml -f infra/opstack/docker-compose.challengers.yml up -d op-challenger l3-op-challenger`
  - Fill `L2_GAME_FACTORY_ADDRESS`, `L3_GAME_FACTORY_ADDRESS`, `CHALLENGER_KEY`/`L3_CHALLENGER_KEY`. Cannon/Kona bins + prestates are wired to the vendored optimism assets (`optimism/cannon/bin`, `optimism/op-program/bin`) via `/assets`, but you can override with `OP_CHALLENGER_CANNON_*`/`OP_CHALLENGER_CANNON_KONA_*`.
- Helper script: `bash infra/scripts/opstack/up-challengers.sh` (starts L1/L2, optional L3, then challenger services with the overlay).
- Flow + sequence diagram for L3→L2→L1 settlement lives in `docs/opstack-l2-l3-stack.md`.

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
