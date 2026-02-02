# Ghost L3 Architecture (Current)

This reflects the repo's actual Ghost L3 wiring as of the current configs under `infra/opstack/`.

## Core services (L3-on-L2)

From `infra/opstack/docker-compose.l3.yml` and `infra/opstack/docker-compose.challengers.yml`:

- `l3-geth`
  - Image: `local/op-geth:${OPSTACK_IMAGE_TAG}`
  - Data: `infra/opstack/l3/${L3_NAME}/data-${L3_CHAIN_ID}`
  - Config: `infra/opstack/l3/${L3_NAME}/config/genesis.json`
  - RPC: host `L3_HOST_RPC` -> container `8545` (default host 39545)
  - WS: host `L3_HOST_WS` -> container `8546` (default host 39548)
  - AuthRPC: container `8551` (JWT at `/config/jwt.txt`)

- `l3-op-node`
  - Image: `local/op-node:${OPSTACK_IMAGE_TAG}`
  - Rollup config: `/config/rollup.json`
  - L1 chain config (parent L2): `/config/l1-chain.json`
  - RPC: host `L3_ROLLUP_RPC_HOST_PORT` -> container `L3_ROLLUP_RPC_PORT` (default host 39546 -> 19546)
  - Metrics: host `L3_METRICS_NODE_HOST_PORT` -> container `L3_METRICS_NODE_PORT` (default 8300)
  - Parent RPC: `L3_L1_RPC` (defaults to `http://l2-geth:8545`)
  - Child execution: `http://l3-geth:8551`

- `l3-op-batcher`
  - Image: `local/op-batcher:${OPSTACK_IMAGE_TAG}`
  - Parent RPC: `L3_L1_RPC` (defaults to `http://op-gate:8545`)
  - Rollup RPC: `http://l3-op-node:${L3_ROLLUP_RPC_PORT}`
  - Child RPC: `http://l3-geth:8545`
  - Metrics: host `L3_METRICS_BATCHER_HOST_PORT` -> container `L3_METRICS_BATCHER_PORT` (default 8301)

- `l3-op-proposer`
  - Image: `local/op-proposer:${OPSTACK_IMAGE_TAG}`
  - Parent RPC: `L3_L1_RPC` (defaults to `http://op-gate:8545`)
  - Rollup RPC: `http://l3-op-node:${L3_ROLLUP_RPC_PORT}`
  - Game factory address: `L3_GAME_FACTORY_ADDRESS`
  - Metrics: host `L3_METRICS_PROPOSER_HOST_PORT` -> container `L3_METRICS_PROPOSER_PORT` (default 8302)

- `l3-op-challenger` (optional, in `docker-compose.challengers.yml`)
  - Image: `local/op-challenger:${OPSTACK_IMAGE_TAG}`
  - Parent RPC: `L3_L1_RPC` (defaults to `http://l2-geth:8545`)
  - Rollup RPC: `http://l3-op-node:${L3_ROLLUP_RPC_PORT}`
  - Child RPC: `http://l3-geth:8545`
  - Game factory address: `L3_GAME_FACTORY_ADDRESS`
  - Metrics: host `L3_CHALLENGER_METRICS_HOST_PORT` -> container `L3_CHALLENGER_METRICS_PORT` (default 8303)

## Parent (L2) dependencies

Ghost L3 settles to Ghost L2 (parent) and depends on:

- `l2-geth` for parent L2 execution (`L3_L1_RPC` / `PARENT_L2_RPC`).
- `op-gate` for guarded parent RPC access (batcher/proposer default).
- L2 contracts required by L3:
  - `L3_PORTAL_ADDRESS`
  - `L3_L2OO_ADDRESS`
  - `L3_SYSTEM_CONFIG_ADDRESS`
  - `L3_DISPUTE_GAME_FACTORY_ADDRESS`
  - `BATCH_INBOX_ADDRESS`

## Config and env sources

- L3 env (canonical): `infra/opstack/.env.l3`
- L3 env example: `infra/opstack/.env.l3.example`
- Rollup config: `infra/opstack/l3/${L3_NAME}/config/rollup.json`
- L3 genesis: `infra/opstack/l3/${L3_NAME}/config/genesis.json`
- Parent chain config: `infra/opstack/l3/${L3_NAME}/config/l1-chain.json`
- JWT secret: `infra/opstack/l3/${L3_NAME}/config/jwt.txt`

## Data paths

- L3 geth data: `infra/opstack/l3/${L3_NAME}/data-${L3_CHAIN_ID}`
- L3 op-node data: `infra/opstack/l3/${L3_NAME}/data-${L3_CHAIN_ID}/op-node`
- L3 challenger data: `infra/opstack/l3/${L3_NAME}/data/challenger`

## Current topology (Mermaid)

```mermaid
graph TD
  subgraph L2[Ghost L2 (Parent)]
    L2Geth[l2-geth RPC]
    L2Gate[op-gate RPC proxy]
    L2Contracts[L2 settlement contracts for L3]
  end

  subgraph L3[Ghost L3]
    L3Geth[l3-geth]
    L3Node[l3-op-node]
    L3Batcher[l3-op-batcher]
    L3Proposer[l3-op-proposer]
    L3Challenger[l3-op-challenger]
  end

  L3Node -->|exec| L3Geth
  L3Batcher -->|rollup rpc| L3Node
  L3Proposer -->|rollup rpc| L3Node
  L3Challenger -->|rollup rpc| L3Node

  L3Node -->|parent rpc| L2Geth
  L3Batcher -->|parent rpc| L2Gate
  L3Proposer -->|parent rpc| L2Gate
  L3Challenger -->|parent rpc| L2Geth

  L3Batcher -->|batches| L2Contracts
  L3Proposer -->|outputs/games| L2Contracts
```
