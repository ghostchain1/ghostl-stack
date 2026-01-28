# OP Stack role configuration (L1 / L2 / L3)

Configure the four OP Stack roles in this repo using the existing compose + env files under `infra/opstack`. This mirrors the devnet defaults already present in `infra/opstack/.env` and `infra/opstack/.env.secrets`.

## Base env + keys
- Copy the samples if you want a clean slate: `cp infra/opstack/.env.sample infra/opstack/.env` and `cp infra/opstack/.env.secrets.sample infra/opstack/.env.secrets`.
- Rotate keys and addresses (writes into `.env`): `bash infra/scripts/opstack/keys/init.sh`.
- Chain IDs + game factory addresses are already set for the current devnet: `L1_CHAIN_ID=14000101`, `L2_CHAIN_ID=901`, `OP_L3_CHAIN_ID=903`, `L2_GAME_FACTORY_ADDRESS`, and `L3_GAME_FACTORY_ADDRESS`. Override them in `.env` if you change deployments.

## L2 roles (GhostLayer2)
- Sequencer: enabled on `op-node` (`--sequencer.enabled`) with system config values in `infra/opstack/config/rollup.json` (`batcherAddr`, gas limits, chain IDs). Uses `SEQUENCER_ADDRESS` from `.env`.
- Batcher: `op-batcher` in `infra/opstack/docker-compose.yml` reads `BATCHER_KEY`, posts to `L1_RPC` via `op-gate`, and uses `L2OO_ADDRESS` + `rollup.json` for DA settings.
- Proposer: `op-proposer` in the same compose uses `PROPOSER_KEY`, `L2OO_ADDRESS`, and posts state roots to L1. Health/metrics exposed on port `8560/7302`.
- Challenger (optional): overlay `infra/opstack/docker-compose.challengers.yml` uses `CHALLENGER_KEY`, `L2_GAME_FACTORY_ADDRESS`, `L2_CHALLENGER_TRACE_TYPE` (`alphabet` in devnet; switch to `cannon` for real traces), and the rollup/genesis JSON files.

## L3 roles (GhostLayer3 on L2)
- Enabled via `infra/opstack/docker-compose.l3.yml`; treats L2 as L1 (`L3_L1_RPC=http://l2-geth:8545` by default).
- Batcher/proposer reuse L2 keys unless you set `L3_BATCHER_KEY` / `L3_PROPOSER_KEY` / `L3_L2OO_ADDRESS` in `.env`.
- Challenger overlay in `docker-compose.challengers.yml` uses `L3_CHALLENGER_KEY` (falls back to `CHALLENGER_KEY`), `L3_GAME_FACTORY_ADDRESS`, and trace type (`L3_CHALLENGER_TRACE_TYPE`).

## Start commands
- Build images once: `bash infra/scripts/opstack/build.sh` and `docker build -t ${OP_GATE_IMAGE:-local/op-gate:0.1.0} -f infra/opstack/gate/Dockerfile infra/opstack/gate`.
- Bring up L1+L2 with your `.env`/`.env.secrets`: `bash infra/scripts/opstack/up-l2.sh` (aligns rollup/l1-chain JSON to the live L1 genesis on start).
- Add L3: `docker compose --env-file infra/opstack/.env --env-file infra/opstack/.env.secrets -f infra/opstack/docker-compose.yml -f infra/opstack/docker-compose.l3.yml up -d l3-geth l3-op-node l3-op-batcher l3-op-proposer` (or `bash infra/scripts/opstack/up.sh` to start both layers).
- Enable challengers: add `-f infra/opstack/docker-compose.challengers.yml up -d op-challenger l3-op-challenger` or run `bash infra/scripts/opstack/up-challengers.sh`.

## Reset / recovery
- Stop and wipe data for L1, L2, and any L3s: `bash infra/scripts/opstack/reset.sh` (also normalizes permissions).
- On restart, `up-l2.sh` re-syncs `rollup.json` and `l1-chain.json` to the fresh L1 genesis so sequencer derivation matches; challengers rebuild from the new chain data using the same env keys.
