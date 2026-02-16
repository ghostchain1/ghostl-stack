# Chains Inventory (Phase 0 — Read-only)

## Refresh (2026-02-16, Phase 0 rerun)

Repo root: `/home/ghost/ghostl-stack`  
Captured at: `2026-02-16T12:03:00Z`  
Baseline commit (HEAD): `2521fb523`

### GhostChain (L1)

- Chain identity:
  - `chainId=14000101` (live probe: `eth_chainId -> 0xd59fe5` on `http://127.0.0.1:18545`)
  - Network label surfaces: `GhostChain`, `Ghostchain`, `GhostChain L1`
- Native currency metadata surfaces:
  - Canonical metadata in service layers: `GST`, `Ghost Token`, `18`
  - Sources: `services/ghost-registry/src/health/checker.ts`, `services/ghost-gas-engine/config/chains.json`, `apps/api/src/server.ts`
- RPC endpoints:
  - External: `http://localhost:18545`, `ws://localhost:18546`, auth `http://localhost:18552`
  - Internal: `http://ghostchain-rpc-proxy:8545`, `http://ghostchain-node1:8545`
- Gas token display pipeline:
  - Explorer: `services/ghostscout-l1/.env` uses `COIN=GST`
  - UI/API: `apps/web` GST labels, `apps/api` canonical gas token lock
  - Compatibility shim: `infra/ghostchain/scripts/ghostscout-entrypoint.sh` maps `GST_JSONRPC_* -> ETHEREUM_JSONRPC_*` for Blockscout runtime compatibility
- Contracts/registries encoding currency assumptions:
  - `contracts/src/l1/NativeToken.sol` (token primitive)
  - `services/ghost-registry/src/health/checker.ts` (`nativeCurrency` payload)
  - `apps/api/src/server.ts` (`CANONICAL_GAS_TOKEN_SYMBOL='GST'`)
- Bridge/value denomination surfaces:
  - `contracts/src/l1/Portal.sol`, `contracts/src/l1/Messenger.sol`, `contracts/src/L2L3Bridge.sol`, `contracts/src/bridge/StandardBridge.sol`
  - `services/bridge-service`, `services/ghost-relayer`

### GhostL2 (OP Stack)

- Chain identity:
  - `chainId=901` (live probe: `eth_chainId -> 0x385` on `http://127.0.0.1:29547`)
  - Rollup config: `infra/opstack/config/rollup.json` (`l1_chain_id=14000101`, `l2_chain_id=901`)
- Native currency metadata surfaces:
  - Genesis gas token address in `infra/opstack/config/genesis-l2.json` (`config.gasToken`)
  - Canonical metadata in registry/API/engine remains `GST / Ghost Token / 18`
  - Drift found in OP env branding: `infra/opstack/.env` and `infra/opstack/.env.l2` still define `GAS_TOKEN_SYMBOL=GHOST` and `GAS_TOKEN_NAME=\"Ghost Token (L1)\"`
- RPC endpoints:
  - External: `http://localhost:29547`, `ws://localhost:29548`, rollup RPC `http://localhost:9546`
  - Guarded/externalized: `http://localhost:18547` (forwarder), `http://localhost:28546` (`op-gate`)
  - Internal: `http://l2-geth:8545`, `http://op-node:9546`
- Gas token display pipeline:
  - Explorer: `services/ghostscout-l2/.env` (`COIN=GST`)
  - UI/API/registry: GST-native (same surfaces as L1)
  - Compatibility shim: `services/ghostscout-l2/entrypoint.sh` writes `ETHEREUM_JSONRPC_*` at container runtime
- Contracts/registries encoding currency assumptions:
  - `contracts/src/l2/*`, `contracts/src/opstack/GasToken.sol`
  - `services/ghost-registry/src/health/checker.ts` and `apps/api/src/server.ts`
- Bridge/value denomination surfaces:
  - `contracts/src/L2L3Bridge.sol`, `contracts/src/bridge/StandardBridge.sol`, `contracts/src/liquidity/BridgeEscrow.sol`
  - `services/bridge-service`, `services/ghost-relayer`, `op-batcher`, `op-proposer`

### GhostL3 (OP Stack anchored to L2)

- Chain identity:
  - `chainId=903` (live probe: `eth_chainId -> 0x387` on `http://127.0.0.1:39545`)
  - Rollup config: `infra/opstack/l3/ghostl3/config/rollup.json` (`l1_chain_id=901`, `l2_chain_id=903`)
- Native currency metadata surfaces:
  - Genesis gas token address in `infra/opstack/l3/ghostl3/config/genesis.json` (`config.gasToken`)
  - Explorer/UI/API/registry surfaces use GST metadata
- RPC endpoints:
  - External: `http://localhost:39545`, `ws://localhost:39548`, rollup RPC `http://localhost:39546`
  - Internal: `http://l3-geth:8545`, `http://l3-op-node:19546`
- Gas token display pipeline:
  - Explorer: `services/ghostscout-l3/.env` (`COIN=GST`)
  - UI/API: GST-native via same canonical services
  - Compatibility shim: `services/ghostscout-l3/entrypoint.sh` (`GST_JSONRPC_* -> ETHEREUM_JSONRPC_*`)
- Contracts/registries encoding currency assumptions:
  - `contracts/src/l3/*`, `contracts/src/L3BridgedToken*.sol`
  - `services/ghost-registry/src/health/checker.ts`, `apps/api/src/server.ts`
- Bridge/value denomination surfaces:
  - `contracts/src/L2L3Bridge.sol`, `contracts/src/bridge/StandardBridge.sol`, `contracts/src/liquidity/BridgeEscrow.sol`
  - `services/bridge-service`, `services/ghost-relayer`

### Chain-Level Notes for Phase 2

- L1/L2/L3 user-facing currency metadata is mostly GST-native already.
- Primary remaining Phase 2 chain-branding drift is in OP env token labels (`GHOST` vs `GST`) and Blockscout legacy `ETHEREUM_JSONRPC_*` compatibility variables.

Repo root: `/home/ghost/ghostl-stack`
Captured at: `2026-02-15T21:38:46.053847Z`
Baseline commit: `5aa4c5a4256b6c0e93581ce11a7f050a67f043c4`

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
