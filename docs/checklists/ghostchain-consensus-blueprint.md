# GhostChain Consensus Blueprint Checklist

## 1. L1 GhostChain PoS setup
- [ ] Define finality: choose economic (BFT + slashing) vs probabilistic and document attacker assumptions (<1/3 X).
- [ ] Implement validator lifecycle API: `registerValidator`, `stake`/`delegate`, `unstake` with unbonding, `exit`.
- [ ] Enforce validator set policy: epoch length 900–1800 blocks, rotate active set, define committee sizes (32–128).
- [ ] Add proposer/attester selection based on stake weights and slot timing (2s blocks).
- [ ] Persist finality gadget (checkpoint root storage + `finalized_checkpoint`).
- [ ] Track slashing evidence: double-sign, surround, downtime; link to `SlashingManagerV2`.
- [ ] Distribute rewards: proposers, attesters, delegators minus commission via `RewardDistributorV2`.
- [ ] Deploy governance/time-lock guard contracts: `GovernorV2`, `ProposalExecutorV2`, `PauseGuardianV2`.
- [ ] Wire in `CheckpointManager` + `AddressBook` for L2 ties.

## 2. Network & client expectations
- [ ] Enforce mempool/fee-market anti-spam rules on L1.
- [ ] Ensure P2P gossip covers block + attestation propagation.
- [ ] Maintain clock discipline/slot timing and relay slashable evidence fast.
- [ ] Monitor `ConsensusParams` and `EpochManager` values for tuning (block time, committee size, max validators).

## 3. L2 PolyBFT integration
- [ ] Use a PolyBFT-style L2 (GhostLayer2) with a small validator set derived from L1 stake or permissioned entry.
- [ ] Configure checkpoint cadence (e.g., every 2–10 minutes) and signature aggregation.
- [ ] Post `checkpointRoot` + signatures to L1 via `CheckpointManager`.
- [ ] Keep bridges aware of checkpoint roots for withdrawals and fraud proofs.
- [ ] Align rollup config genesis hash + timestamps with L1 (see `infra/scripts/opstack/up-l2.sh`).
- [ ] Deploy `OutputOracle` / `FinalizationManager` on L2; connect `DisputeGameFactoryV2` game contracts.

## 4. L3 OP Stack deployment
- [ ] Run centralized sequencer/batcher/proposer on OP Stack pointing at L2 RPCs.
- [ ] Publish L3 batches frequently (1–10s) then output roots every 1–5 minutes to `OutputOracle`.
- [ ] Supply dispute game contracts (`DisputeGameFactoryV2`, `FaultDisputeGame`) on L2 and enforce challenge window.
- [ ] Ensure L3 data availability: post calldata/blobs to L2 or document trust tradeoff for external DA.
- [ ] Configure challengers to watch `OutputOracle`/`FinalizationManager` and raise disputes when needed.

## 5. Alignment decisions to capture
- [ ] Decide if L2 validators derive from L1 stake (preferred), and document the bridge/deposit flow.
- [ ] Lock checkpoint cadence (L2→L1) and enforce via monitoring/alerts.
- [ ] Define L3 DA strategy (on-chain calldata vs external) and log it in this checklist.
- [ ] Outline sequencer decentralization plan (start centralized, add PoS later).
- [ ] Track fraud/fault proof coverage; note if any layer currently runs as “trusted optimistic”.
- [ ] Document L3→L2 and L2→L1 withdrawal paths+timing relative to challenge windows and checkpoints.

## 6. Upgrade path (Phase 1→3)
- [ ] **Phase 1 (Ship)**: deploy PoS + bridge + L2 PolyBFT + centralized L3 sequencer. Confirm default configs match blueprint.
- [ ] **Phase 2 (Harden)**: expand validator set, strengthen slashing and checkpoint monitoring, deploy real dispute games for L3.
- [ ] **Phase 3 (Decentralize)**: derive L2 set from L1 stake, decentralize sequencer (shared/PoS), add external DA only with clear risk acknowledgments.

## 7. Operational touches
- [ ] Keep `infra/scripts/opstack/deploy.sh` and `deploy_futuristic_stack.ts` aligned so services get updated FUT_* addresses.
- [ ] Store deployment artifacts in docs/config (`docs/ghostchain-pos-alignment.md`, `infra/opstack/.env`).
- [ ] Reset/reset scripts (`infra/scripts/opstack/reset.sh`) remove old artifacts after redeploy.
- [ ] Periodically rerun `infra/scripts/opstack/up.sh` → `deploy.sh` for fresh stack builds.
