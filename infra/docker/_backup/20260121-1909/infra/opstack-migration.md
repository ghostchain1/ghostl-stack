# OP Stack Migration Plan (Edge -> OP Stack -> Hybrid ZK)

## Goals
- Replace Polygon Edge devnet with an OP Stack devnet for GhostL2.
- Keep GhostL3 as an OP Stack app-chain on GhostL2.
- Preserve AI Guard/Relayer flows; add hooks into batcher/finality.

## Workstreams
1) Devnet bootstrap
   - Add OP Stack docker-compose (geth+l2geth/op-node/op-batcher/op-proposer/op-challenger) under `.devcontainer` or `infra/opstack/`.
   - Provide envs for RPCs: L1 (anvil), L2 (op-node), L3 (second op-node).
   - Seed funded keys (reuse keys/init.sh pattern).
   - Health checks: op-node RPC, batcher status, proposer status.

2) Deploy pipeline
   - Hardhat network configs for `ghostl2-op` and `ghostl3-op`.
   - Deploy scripts write `.env` for Guard/Relayer/Proposers/Challengers (same as current Edge flow).
   - Add reset/init scripts (clean datadirs, re-gen rollup configs).

3) AI Guard integration
   - Guard consumes OP Stack RPCs for L2/L3.
   - Policy endpoints remain the same; AI monitor can call Guard delay/pause.
   - Wire proposer to respect Guard signals (finalize gating) in a later iteration.

4) Observability
   - Prometheus scrape jobs for op-node/batcher/proposer.
   - Grafana dashboards for L2/L3 latency, batch sizes, finality time, fault proof stats (when enabled).

5) ZK path (later)
   - Evaluate Polygon CDK/zkEVM for OP batch proofs; target pluggable prover service.
   - Keep batch format compatible to minimize rewrites.

## Deliverables (short list)
- `infra/opstack/docker-compose.yml` (L1 anvil + OP Stack L2 + OP Stack L3).
- `infra/opstack/env.sample` with key vars (batcher/proposer keys, rollup params).
- `hardhat.networks.ts` entries for `ghostl2-op`, `ghostl3-op`.
- Scripts:
  - `infra/scripts/opstack/up.sh` (spin devnet, wait for RPCs)
  - `infra/scripts/opstack/reset.sh` (clean datadirs)
  - `infra/scripts/opstack/deploy.sh` (deploy contracts, write envs)
  - `infra/scripts/opstack/keys/init.sh` (generate keys, fund, configure roles)
- Docs: quickstart + troubleshooting.
