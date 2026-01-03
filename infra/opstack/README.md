# GhostChain OP Stack Devnet

OP Stack L2 (GhostL2) devnet that aligns with the GhostChain blueprint: Optimistic now, hybrid OP + ZK later, with AI Guard/Relayer hooks on top.

## What runs
- L1: Anvil (host port `28545`)
- L2: op-geth + op-node + op-batcher + op-proposer (host port `29545`)
- Containers use `local/op-*` images built from the vendored Optimism sources.

## Quickstart
```bash
# 1) Build images (one-time, takes a few minutes)
bash infra/scripts/opstack/build.sh

# 2) Configure env/keys
cp infra/opstack/.env.sample infra/opstack/.env
bash infra/scripts/opstack/keys/init.sh

# 3) Start devnet
bash infra/scripts/opstack/up.sh
# L1 RPC: http://localhost:28545
# L2 RPC: http://localhost:29545

# 4) Deploy contracts to OP L2 and emit service env files
bash infra/scripts/opstack/deploy.sh
```

## Reset
```bash
bash infra/scripts/opstack/reset.sh
```

## Notes
- `contracts/hardhat.config.ts` already contains `ghostl2Op` / `ghostl3Op` networks; `infra/scripts/opstack/deploy.sh` targets `ghostl2Op`.
- `.env.sample` includes host/internal RPCs and chain IDs; `keys/init.sh` refreshes keys and fills corresponding addresses.
- L3 is reserved for the upcoming OP Stack app-chain on GhostL2 (host RPC placeholder `39545`).
