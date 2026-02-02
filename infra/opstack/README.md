# GhostChain OP Stack Devnet

OP Stack L2 (GhostL2) devnet that aligns with the GhostChain blueprint: Optimistic now, hybrid OP + ZK later, with AI Guard/Relayer hooks on top.

## What runs
- L1: GhostChain geth PoA devnet (Ethereum clone) on `18545`
- L2: GhostL2 (Shibarium clone) op-geth + op-node + op-batcher + op-proposer on `29547` (direct) / `18547` (guarded via op-gate)
- L3: GhostL3 OP Stack L3 on GhostL2 on `39545` (when `docker-compose.l3.yml` is running)
- `op-gate` guards L2 RPC and `op-gate-l1` guards L1 submissions for batcher/proposer; both can be driven by Ghost Guard (metrics on `28546/metrics/prom`, `28547/metrics/prom`).
- Containers use `local/op-*` images built from the vendored Optimism sources.

## Quickstart
```bash
# 1) Build images (one-time, takes a few minutes)
#    OPSTACK_IMAGE_TAG=devnet is used for all local/op-* images.
bash infra/scripts/opstack/build.sh

# Build op-gate image (bakes deps, runs as non-root)
docker build -t ${OP_GATE_IMAGE:-local/op-gate:0.1.0} -f infra/opstack/gate/Dockerfile infra/opstack/gate

# 2) Configure env/keys (keep secrets in .env.secrets)
cp infra/opstack/.env.l2.example infra/opstack/.env.l2            # canonical non-secret config
cp infra/opstack/.env.secrets.sample infra/opstack/.env.secrets   # keys; do not commit
bash infra/scripts/opstack/keys/init.sh                           # regenerates keys/addresses
bash infra/scripts/env-sync-l2.sh                                 # renders infra/opstack/.env
# Optional: point GATE_GUARD_URL at your Ghost Guard instance (default host:7070).

# Optional: validate bind-mount paths before boot
bash infra/scripts/opstack/validate-mounts.sh l2
# For L3 config (if enabled):
bash infra/scripts/opstack/validate-mounts.sh l3

# 3) Ensure GhostChain L1 is running (separate stack)
pushd infra/ghostchain && bash scripts/up.sh && popd

# 4) Start devnet
bash infra/scripts/opstack/up.sh -- --env-file .env --env-file .env.secrets
# L1 RPC: http://localhost:18545
# L2 RPC: http://localhost:29547 (direct) or http://localhost:18547 (forwarder)

# 5) Deploy contracts (L1 core + L2/L3 glue) and emit service env files
bash infra/scripts/opstack/deploy.sh
# Gate: `op-batcher` / `op-proposer` point at `op-gate` (host `28546`) for Guard-aware pause/delay/deny.

# Optional: start observability (Prometheus + Grafana) in a separate shell
docker compose --env-file infra/opstack/.env --env-file infra/opstack/.env.secrets \
  -f infra/opstack/docker-compose.yml --profile observability up -d prometheus grafana
# Optional: start AI economics + monitor stack (ghost-gas-engine + postgres + redis + worker + ai-monitor)
docker compose --env-file infra/opstack/.env --env-file infra/opstack/.env.secrets \
  -f infra/opstack/docker-compose.yml --profile ai up -d
```

## L2 + L3 stack and challengers
- Combined run: `docker compose --env-file infra/opstack/.env --env-file infra/opstack/.env.secrets -f infra/opstack/docker-compose.yml -f infra/opstack/docker-compose.l3.yml up -d op-gate l2-geth op-node op-batcher op-proposer l3-geth l3-op-node l3-op-batcher l3-op-proposer`
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
- L3 runs on GhostL2 when `docker-compose.l3.yml` is enabled (host RPC `39545`).
- L3 guard defaults are now fail-closed (`L3_GUARD_FAIL_OPEN=false` by default).
- Healthchecks gate startup ordering; if you tweak ports, update the compose healthchecks accordingly.
- L1 is external (GhostChain geth PoA on `http://localhost:18545`); make sure it is running before bringing up the OP Stack stack.
- `deploy.sh` runs `contracts/scripts/deploy_futuristic_stack.ts` (staking/slashing/governance/treasury/native token stubs) before deploying OP contracts.
- Set `TRANSFER_ADMIN_TO_GOVERNOR=true` to hand execution-layer configs (consensus/chain/genesis/execution) to governance after deploy.
- Optional: `SECURITY_CHECKPOINTS=1 bash infra/scripts/opstack/deploy.sh` runs Foundry + Slither checks before deploying contracts.
- For AI economics + governance dashboards, run `services/ghost-gas-engine` (metrics on `:3210`) and keep `ai-monitor` enabled. Prometheus scrapes both by default.
- Set `BRIDGE_L2L3_ADDRESS`, `L2_OUTPUT_ORACLE_ADDRESS`, and `L3_OUTPUT_ORACLE_ADDRESS` in `.env` to enable bridge/oracle telemetry.

## Canonical gas token (L1/L2/L3)
All layers must use the single canonical GHOST token on GhostChain L1:

```text
Ghost Token (GHOST)
0x5FbDB2315678afecb367f032d93F642f64180aa3
```

Do not deploy per-layer gas tokens. The deploy scripts now enforce the canonical address.

If the canonical token contract is not already deployed at the address above, the OP stack `DeployGasToken` script will revert.
For local testing only, `deploy_futuristic_stack.ts` can deploy a `NativeTokenV2` when `ALLOW_NATIVE_TOKEN_DEPLOY=1`.

```bash
export USE_CUSTOM_GAS_TOKEN=true
export CUSTOM_GAS_TOKEN_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
```
