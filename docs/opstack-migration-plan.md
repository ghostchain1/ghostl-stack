# OP Stack Migration + Guard Integration Plan

Detailed, ordered plan to move from Polygon Edge (IBFT) to OP Stack while keeping Ghost Guard/Relayer reusable, wiring Guard into finalize, templating GhostL3, drafting whitepaper material, and running the local OP devnet.

## 1) Migration: Polygon Edge → OP Stack
- Build and boot: `bash infra/scripts/opstack/build.sh`, `cp infra/opstack/.env.sample infra/opstack/.env`, `bash infra/scripts/opstack/keys/init.sh`, `bash infra/scripts/opstack/up.sh` (L1 `28545`, L2 `29545`).
- Deploy contracts on OP L2 and emit service envs: `bash infra/scripts/opstack/deploy.sh` (uses Hardhat `ghostl2Op`; writes `.env` files under `services/`).
- Align service RPCs with current ports so Guard/Relayer keep working: `RPC_L1=http://localhost:28545`, `RPC_L2=http://localhost:29545`, `RPC_L3` placeholder `http://localhost:39545` for future OP L3. Chain IDs: L1 `14000101`, L2 `901`, L3 `903` (configurable in `infra/opstack/.env`).
- Map Edge components to OP Stack: Edge validator → `op-node` + `op-geth`; Edge relayer → existing Ghost Relayer (adjust envs); Edge rollup proposer/challenger → OP `op-proposer`/`op-challenger` (container exists but disabled).
- Observability/health: add op-* health endpoints to Prometheus/Grafana alongside existing dashboards (ports: op-node `9546`, batcher `8551`, proposer `8560`).
- Data/reset: `bash infra/scripts/opstack/reset.sh` to clear `infra/opstack/data/*` when chain IDs or keys change.

## 2) Guard hooks at finalize (op-batcher/op-proposer)
- `op-gate` JSON-RPC proxy now fronts L1 for batcher/proposer; it calls Ghost Guard `/gate/eval`, can pause/delay/block, writes `/state/guard-decisions.jsonl`, and exposes metrics at `/metrics/prom` (host `28546`).
- Pre-batch score: insert a Guard gate before `op-batcher` posts to L1. Sidecar polls `rollup-rpc`/`l2-geth` for pending channel data, calls Guard `/score` (risk, delay, pause), and blocks or delays the batch post. Persist decisions in `/state/guard-decisions.json`.
- Finalize gate: wrap `op-proposer` output-root submission with a Guard check. If Guard returns `pause` or `quarantine`, hold the proposal; if `reject`, mark batch/channel as challengeable. Allow manual override via admin token.
- Persistence + challengers: write Guard outcomes (batch root, block range, decision, reason) to shared state so `op-challenger` or a lightweight challenger shim can auto-challenge rejected batches using `CHALLENGER_KEY`.
- UX/API: expose Guard endpoints for `approve`, `delay`, `pause`, `override`, and a status feed (`/pending-batches`) so Ops can see queued/blocked batches.
- Safety defaults: start with `allow-non-finalized` true for proposer but gate with Guard; keep confirmations `0` for devnet, raise in staging.

## 3) GhostL3 template (OP Stack app-chain on GhostL2)
- Provide a scaffold script (`infra/scripts/opstack/l3/new.sh`) that takes chain name/ID + ports and emits: L3 config (rollup/genesis), JWT, data dirs under `infra/opstack/l3/<name>/`, and env snippets.
- Compose overlay: `infra/opstack/docker-compose.l3.yml` spins `op-geth`, `op-node`, `op-batcher`, `op-proposer` for L3, pointing settlement RPC to GhostL2 (`L3_L1_RPC`, defaults to `l2-geth:8545`).
- Tooling wiring: auto-generate Hardhat network entry (ghostl3Op) and service env examples with `RPC_L2` = GhostL2, `RPC_L3` = new L3 RPC. Include Guard/Relayer sample policies (e.g., higher delay, lower thresholds).
- One-command DX: `bash infra/scripts/opstack/l3/new.sh ghostpay --chain-id 1101 --rpc-port 49545 --l1-port 48545` → writes configs, prints `docker compose -f infra/opstack/docker-compose.yml -f infra/opstack/docker-compose.l3.yml up -d l3-*`.
- Docs: short README under `infra/opstack/l3/` describing how to mint/bridge a token via Ghost Relayer between L2↔L3.

## 4) Whitepaper L2 architecture section (outline)
- Core stack: OP Stack optimistic rollup settling on GhostChain L1, batcher/proposer/challenger roles, fraud window, DA (L1 calldata today; EigenDA/Celestia option later).
- AI governance: Guard risk scoring on deposits/txs, batch gating before proposal, delayed finalize, auto-quarantine path, and challenger automation based on Guard verdicts.
- L3 composition: OP Stack app-chains on GhostL2, each with per-app policies and fees; Relayer/Guard act across L2↔L3 bridges.
- Upgrade path: Hybrid OP+ZK where OP batches gain validity proofs (Polygon CDK/zkEVM) without changing dapps; sequencer remains under Ghost governance; data availability swaps pluggable.
- Operations: observability (Prometheus/Grafana), key management (sequencer/batcher/proposer/challenger), reset/recovery, and admin override safety.

## 5) Local OP Stack devnet (with Guard/Relayer)
- Build → configure → start: `bash infra/scripts/opstack/build.sh`, copy `.env`, `bash infra/scripts/opstack/keys/init.sh`, `bash infra/scripts/opstack/up.sh`.
- Deploy + envs: `bash infra/scripts/opstack/deploy.sh` to push contracts to OP L2 and rewrite service `.env` files to host RPCs (`28545/29545`). Confirm `services/ghost-guard/.env` and `services/ghost-relayer/.env` point at OP ports.
- Run services against OP devnet (from repo root): `bash infra/scripts/up.sh` is still Edge; instead start Guard/Relayer directly via `docker compose` or `npm run start` inside `services/*` using the OP envs emitted by deploy.
- Health: `curl -s http://localhost:29545` (op-geth), `curl -s http://localhost:9546` (op-node), `curl -s http://localhost:7171/health` (Relayer), `curl -s http://localhost:7070/health` (Guard). Use `infra/scripts/doctor.sh` as a reference for adding op-* checks.
- Observability: Prometheus scrapes `op-node`/`op-batcher`/`op-proposer` metrics (`7300/7301/7302`) and `op-gate` metrics (`28546/metrics/prom`).
- Reset loop: `bash infra/scripts/opstack/reset.sh` when changing chain IDs/keys; rerun `keys/init.sh` and `deploy.sh` afterward.
