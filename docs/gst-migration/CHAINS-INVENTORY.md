# Chains Inventory (Phase 0 — Read-only)

Repo root: `/home/ghost/ghostl-stack`
Captured at: `2026-02-14T12:31:08Z`
Baseline commit: `4a264824e4103220f88e75f0242666815180b35b`

This inventory records the canonical **L1/L2/L3 chain surfaces** (configs, RPC endpoints, explorers, and native currency display touchpoints) to support a repo-wide GST migration. It intentionally makes **no configuration changes**.

## GhostChain (L1)

| Item | Value |
|---|---|
| ChainId | `14000101` (`0xd59fe5` via `eth_chainId` at `http://127.0.0.1:18545`) |
| Genesis | `infra/ghostchain/geth/genesis.json` |
| Consensus | Clique PoA (`period=2`, `epoch=30000`) |
| Compose | `infra/ghostchain/docker-compose.l1.yml` |
| Host RPC (HTTP) | `http://localhost:18545` (rpc proxy) |
| Host RPC (WS) | `ws://localhost:18546` |
| Host AuthRPC | `http://localhost:18552` |
| Host Metrics | `http://localhost:18660` |

Explorer / indexer surfaces:
- `infra/ghostchain/docker-compose.l1.yml`: `ghostscout` (Blockscout) uses `ETHEREUM_JSONRPC_*` env keys and `COIN=GST` (profile `legacy`, API-only, port `18644`).
- `services/ghostscout-l1/.env`: uses `ETHEREUM_JSONRPC_*`, `COIN=GST`, `CHAIN_ID=14000101` (compose `services/ghostscout-l1/docker-compose.yml`, port `18641`).

Native currency metadata touchpoints (non-exhaustive):
- Blockscout/ghostscout uses `COIN` for the displayed symbol (currently `GST`).
- `services/ghost-registry/src/health/checker.ts` defines canonical gas token metadata (currently `GST` / `Ghost Token` / `18`).
- `services/ghost-gas-engine/config/chains.json` repeats the gas token metadata for L1/L2/L3 (currently `GST`).

## GhostL2 (L2, OP Stack)

| Item | Value |
|---|---|
| ChainId | `901` (`0x385` via `eth_chainId` at `http://127.0.0.1:29547`) |
| Genesis | `infra/opstack/config/genesis-l2.json` (`config.chainId=901`, `config.gasToken=0x5FbDB2315678afecb367f032d93F642f64180aa3`) |
| Rollup config | `infra/opstack/config/rollup.json` (`l1_chain_id=14000101`, `l2_chain_id=901`, `genesis.l1.number=272176`) |
| Compose | `infra/opstack/docker-compose.yml` |
| Host RPC (direct) | `http://localhost:29547` |
| Host WS (direct) | `ws://localhost:29548` |
| Host RPC (guarded) | `http://localhost:18547` (forwarder -> `op-gate`) |
| op-node RPC | `http://localhost:9546` |
| sequencer op-node RPC | `http://localhost:9646` |

Explorer / indexer surfaces:
- `services/ghostscout-l2/.env`: uses `ETHEREUM_JSONRPC_*`, `COIN=GST`, `CHAIN_ID=901` (compose `services/ghostscout-l2/docker-compose.yml`, port `18642`).

Notes:
- OP Stack custom gas token is encoded by `config.gasToken` in the L2 genesis; symbol/name are surfaced by services/UIs and explorer configs.
- `infra/opstack/config/l1-genesis.json` has `chainId=1337` and appears to be a template/test genesis, not the running GhostChain L1 (chainId `14000101`).

## GhostL3 (L3, OP Stack on GhostL2)

| Item | Value |
|---|---|
| ChainId | `903` (`0x387` via `eth_chainId` at `http://127.0.0.1:39545`) |
| Genesis | `infra/opstack/l3/ghostl3/config/genesis.json` (`config.chainId=903`, `config.gasToken=0x5FbDB2315678afecb367f032d93F642f64180aa3`) |
| Rollup config | `infra/opstack/l3/ghostl3/config/rollup.json` (`l1_chain_id=901`, `l2_chain_id=903`, `genesis.l1.number=689`) |
| Compose | `infra/opstack/docker-compose.l3.yml` |
| Host RPC (direct) | `http://localhost:39545` |
| Host WS (direct) | `ws://localhost:39548` |
| l3 op-node rollup RPC | `http://localhost:39546` |

Explorer / indexer surfaces:
- `services/ghostscout-l3/.env`: uses `ETHEREUM_JSONRPC_*`, `COIN=GST`, `CHAIN_ID=903` (compose `services/ghostscout-l3/docker-compose.yml`, port `18643`).

## UI Surfaces

- `apps/web/src/modules/overview/OperatorOverview.tsx` renders values as `GST` / `gGST` today (this is branding, not RPC-method namespace).
- `apps/web/.env.example` and `apps/web/.env.local.example` define public RPC endpoints for L1/L2/L3.
