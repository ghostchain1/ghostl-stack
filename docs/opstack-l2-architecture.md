# GhostChain OP Stack L2 Architecture (Whitepaper Draft)

## Overview
- GhostL2 is an OP Stack chain settling on Ethereum L1. GhostL3 app-chains settle on GhostL2.
- Threat model assumes adversarial sequencers/proposers; AI Guard sits in the control plane to score and gate batches before L1 publication and to trigger challengers.
- Roadmap: Optimistic fraud proofs first; optional ZK finality added later (Polygon CDK/zkEVM style proofs of OP batches).

## Components
- L1 (Ethereum): OptimismPortal, L1StandardBridge, SystemConfig, DisputeGameFactory, AnchorStateRegistry.
- L2 (GhostL2): op-geth execution, op-node, op-batcher, op-proposer, op-gate (Guard shim), Guard service (scoring/policy), relayer, challenger (optional in current devnet).
- L3 (GhostL3s): OP Stack app chains settling on GhostL2; each with op-geth/op-node/op-batcher/op-proposer and their own Guard/Relayer wiring.

## Transaction & Batch Flow
1) Users send txs to GhostL2 RPC (op-geth).
2) op-node sequences blocks; op-batcher builds channels of L2 tx data.
3) **Guard gate** (op-gate) intercepts batcher/proposer L1 RPC:
   - Parses tx sender (batcher/proposer) and payload metadata.
   - Calls Guard `/gate/eval` for risk scoring; supports allow/block/delay.
   - Logs decisions to `guard-decisions.jsonl`, exposes Prometheus metrics.
4) If allowed, batcher submits channel to L1 (calldata); proposer posts L2 outputs to DisputeGameFactory.
5) Fraud proof window runs; challengers can be auto-fired by Guard if risk exceeds thresholds.
6) Finalized outputs update L2 state roots; withdrawals through OptimismPortal bridge.

## Governance & Security Hooks
- System roles (sequencer/batcher/proposer/challenger) are externally owned and can be rotated.
- Guard policies:
  - Risk scoring on batch metadata and proposer commits.
  - Manual modes: allow/pause/delay/block with retry windows.
  - Auto-pause triggers can halt publishing or force delays.
- Audit surface:
  - SystemConfig parameters (gas limit, overhead, scalar, fee recipients).
  - Batcher/proposer keys, L2OutputOracle/DisputeGameFactory addresses.

## L3 Composition Model
- Each L3 is an OP Stack chain with L1 RPC pointed at GhostL2 rollup RPC.
- Generated via `bash infra/scripts/opstack/l3/new.sh <name> --chain-id <id>`.
- Shared infra: Guard/Relayer templates reuse the same scoring and env wiring; proposer/challenger connect to GhostL2 as “L1”.
- Gas: Ultra-low on L3; settlement fees on L2.

## Data Availability Options
- Default: L1 calldata.
- Future: EigenDA/Celestia via Alt-DA when stable; OP Stack supports DA service endpoints with throttle controls.

## ZK Finality Upgrade Path
- Add validity proofs over OP batches (e.g., Polygon CDK/zkEVM prover) without changing execution.
- Hybrid mode: optimistic inclusion for speed, ZK proof for faster trust-minimized finality.
- Compatibility: keep contract addresses/rollup params stable; add proof verifier contract and batch proof commitments.

## Operational Observability
- Prometheus scrapes: op-node (7300), op-batcher (7301), op-proposer (7302), op-gate (28546), Guard/Relayer/Proposers/Challengers.
- Logs: `infra/opstack/gate/guard-decisions.jsonl` (append-only); docker logs for op-* and services.
- Health: op-node RPC `eth_syncing=false`, batcher/proposer RPC live, Guard `/health`, Relayer `/health`.

## Environment & Keys (devnet)
- L2 chainId 901, L3 chainId 903 (ghostl3 default). L1 chainId 14000101.
- Role keys (L2):
  - Sequencer: 0x39F920a6CefE557B193BB5f301bb83737A56A4C8
  - Batcher:   0x32171083fD74F0423eAB1192F04125d3a8f0B1C2
  - Proposer:  0x5ACEe8F117C7923748cD2bCca30335C99E4eABD9
  - Challenger:0x41100A2f4FC313FBF0aA16976AbE7DAF298dc9AF
- Service keys (app layer):
  - Guard:     0x63911AFB05b5694112FBD0345736960Ea1d1fBD9
  - Relayer L3:0x94b0c7B5D71287155aB3585524A0a69Cb26A4272
  - Relayer L2:0x0D06226795854080deB774D23C44886AA53AD78B
  - Proposer:  0x7b1F74843f70dC0b732fafA0804d407E26fbe934
  - Challenger:0xB65A6F4fD952295129Be3018C02B9a67E36fb4bf

## Runbook (Devnet)
1) `bash infra/scripts/opstack/up.sh` (L1/L2 stack).
2) `bash infra/scripts/opstack/deploy.sh` (contracts + env files).
3) `docker compose -f .devcontainer/docker-compose.yml up -d` (services).
4) Check health: Guard `/health`, Relayer `/health`, proposer/challenger health endpoints, op-node metrics.
5) For L3: `bash infra/scripts/opstack/l3/new.sh ghostapp ...` then compose overlay per README.

## Future Work
- Wire auto-challenger trigger from Guard decisions.
- Add ZK proof verifier contract hook (CDK/zkEVM) to rollup config.
- Expand Grafana dashboards for Guard decision rates and batcher/proposer latency/error budgets.
