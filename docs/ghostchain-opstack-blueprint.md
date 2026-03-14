# GhostChain OP Stack Blueprint

Recommendation carried into this repo: GhostL2 runs on OP Stack now, with a clean path to a hybrid OP + ZK rollup later (Polygon CDK / zkEVM-style proofs). GhostL3 stays as OP Stack app-chains on GhostL2. AI Guard + relayers remain first-class, riding atop the L1 custom PoS described in `docs/ghostchain-l1.md` / `docs/ghostchain-pos-alignment.md`.

## Why OP Stack fits GhostChain
- Full control of sequencer / batcher / proposer / challenger so AI Guard can pause, delay, or throttle before finalize.
- Native L3 story (app-specific chains anchored to GhostL2) matches the GhostL3 plan.
- EVM-perfect: reuse Solidity, Hardhat/Foundry, wallets, auditors; no new language burden.
- Battle-tested production lineage (Optimism, Base, Zora, World Chain).

## Why not the others (for now)
- zkSync / Starknet: harder to inject AI hooks; tighter prover pipelines; custom languages.
- Polygon Edge solo: great for dev, but not a rollup; keep for local protos only.
- Arbitrum Nitro: strong tech but more opinionated for deep control-plane experiments.

## Rollout phases
1) Today: Polygon Edge (IBFT) devnet for fast prototyping + GhostL3 demos.
2) Production L2: GhostL2 = OP Stack optimistic rollup settling on GhostChain L1 (EigenDA/Celestia later).
3) L3: OP Stack app-chains on GhostL2 with per-app AI policies.
4) ZK upgrade: add validity proofs to OP batches (Polygon CDK/zkEVM-style) without rewriting the stack.

## Consensus alignment (L1 → L2 → L3)

1. **L1 finality** – GhostChain PoS publishes epochs/checkpoints, slashes misbehavior, and exposes `CheckpointManager`, `PauseGuardian`, and governance endpoints for L2/L3 to trust.
2. **L2 finality** – GhostL2 runs OP Stack (op-node/op-geth) to produce blocks and batches, then posts output roots + dispute/finality data back to GhostChain L1 via the bridge stack (`OutputOracle`, `FinalizationManager`, `DisputeGameFactoryV2`).
3. **L3 finality** – OP Stack app-chains (ghost-l3) operate on the “soft finality” sequencer/batcher/proposer model, emit output roots + batches to L2, and rely on the L2 dispute/finality contracts to enforce correctness; withdraws follow the challenge window, then await the L2 checkpoint that was anchored to L1.

This multi-layer ladder is documented in `docs/ghostchain-pos-alignment.md`; keep the `FUT_*` contract addresses in sync with your deploy script outputs so services can subscribe to the correct oracle/bridge endpoints.

## Stack reference (this repo)
- L2/L3 framework: OP Stack (optimistic today; ZK proofs later).
- Dev chain: OP Stack devnet under `infra/opstack/` (Anvil L1 + op-geth/op-node/batcher/proposer); scripts now call `npm run deploy:futuristic` before the OP deployments to ensure the L1 PoS + bridge stack is on-chain.
- Tooling: Hardhat networks `ghostl2Op` / `ghostl3Op` (see `contracts/hardhat.config.ts`); new `deploy_futuristic_stack.ts` script outputs `FUT_*` addresses consumed by the services env files.
- Services: Ghost Guard, Relayer, rollup proposer/challenger read RPCs + envs produced by the `deploy.sh` script, which now rewrites beacon addresses for checkpoints, finalization, and the AddressBook.

## Operational steps (devnet)
- Build images (once): `bash infra/scripts/opstack/build.sh`
- Configure keys/IDs: `cp infra/opstack/.env.sample infra/opstack/.env && bash infra/scripts/opstack/keys/init.sh`
- Start OP devnet: `bash infra/scripts/opstack/up.sh` (L1 at host `28545`, L2 at `29545` by default)
- Deploy contracts to OP L2: `bash infra/scripts/opstack/deploy.sh` (writes service env files pointing at the OP RPCs)
- Reset (clean datadirs): `bash infra/scripts/opstack/reset.sh`

## Next actions you can take
1) Migrate deploy/runtime to `ghostl2Op` end-to-end (Guard/Relayer envs now written by `deploy.sh`).
2) Add AI Guard hooks to batcher/proposer (delay/pause on risk).
3) Stand up the first GhostL3 app-chain on GhostL2 (reuse OP Stack tooling).
4) Extend observability for op-node/batcher/proposer alongside existing dashboards.
5) Explore the ZK finality add-on (Polygon CDK/zkEVM proofs for OP batches) once L2 is stable.
