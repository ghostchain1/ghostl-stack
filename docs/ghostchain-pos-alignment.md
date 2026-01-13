## GhostChain PoS + L2/L3 Alignment Blueprint

Practical spec for GhostChain L1 PoS (BFT) and how to compose finality with a PolyBFT-style L2 and OP Stack L3.

### L1 PoS (GhostChain)
- Finality: BFT economic finality. Checkpoint finalized when ≥2/3 voting power attests.
- Timing: 2s blocks; epochs 900–1800 blocks (30–60m).
- Validator set: 50–200 active; per-validator cap optional; unbonding 7–21 days.
- Slashing: double-sign 5–10% + exit; surround 1–5% + jail; downtime = jail + small penalty.
- Rewards: proposer base+tips; attesters share; delegators share minus commission.
- Governance: timelocked param changes; PauseGuardian for narrow-scope halt (bridges, validator ops).
- Contracts mapping: `ValidatorRegistryV2`, `StakingManagerV2` (shares, optional unbonding/jail), `SlashingManagerV2`, `RewardDistributorV2`, `TreasuryV2`, `EpochManager`, `ConsensusParams`, `GovernorV2` + `ProposalExecutorV2`, `PauseGuardianV2`.

### L2 (PolyBFT-style) → L1
- Validator set: derive from L1 stake receipts (preferred) or permissioned bootstrap.
- Checkpoints: every 2–10 minutes submit `checkpointRoot` + sigs to L1. L1 verifies ≥2/3 voting power for the epoch.
- Finality: L2 fast BFT; economically final once checkpoint is finalized on L1. Non-final checkpoints revert on L1 reorg.
- Contracts: `CheckpointManager` on L1; L2 uses its BFT engine + bridge to post roots.

### L3 (OP Stack-style) → L2
- Sequencer: start centralized; batches to L2 every 1–10s.
- Output roots: post to `OutputOracle` on L2 every 1–5 minutes; `FinalizationManager` enforces challenge window and checks disputes.
- Disputes: `DisputeGameFactoryV2` + `FaultDisputeGame` on L2; `FinalizationManager` only finalizes if no fault proven and challenge window passed.
- DA: default is calldata/blobs on L2; external DA only with explicit trust change.
- Finality ladder: soft (sequencer) → settlement (batch on L2 + L2 finalized) → economic (output root unchallenged + L2 checkpoint finalized on L1).

### Key alignment decisions (recommended)
1) L2 validators from L1 stake: yes (best security story).
2) Checkpoint cadence L2→L1: 2–10 minutes, tuned for gas vs safety.
3) L3 DA: post to L2 calldata/blobs.
4) Sequencer decentralization: centralized now; plan PoS/committee later.
5) Fault proofs: required for trustless; if absent, call out “trusted optimistic.”
6) Withdrawals: L3→L2 follow L3 challenge; L2→L1 follow checkpoint finality.

### Param suggestions (initial mainnet-ish)
- Block time: 2s
- Epoch length: 1200 blocks (~40m)
- Committee size: 64–128 attesters/block
- Min validator stake: 50k–100k GHOST
- Unbonding: 14 days
- Slashing: double-sign 7.5%, surround 3%, downtime jail + 0.5%
- L2 checkpoint cadence: 5 minutes
- L3 output cadence: 2 minutes; challenge window: 1–7 days (env-tuned)

### Message flows (happy path)
- **L2 checkpoint:** L2 validators sign root → submit to L1 `CheckpointManager` with voting power sums → after L1 finality, checkpoint is authoritative.
- **L3 batch:** Sequencer posts batches to L2 → proposer posts output root to `OutputOracle` → if unchallenged for window, `FinalizationManager` finalizes; otherwise require clean dispute result.
- **Withdrawals:** L3→L2 wait for L3 challenge/finalization; L2→L1 wait for checkpoint finalized on L1. Bridges should reference finalized roots.

### Config template (env-driven)
- L1: `EPOCH_LENGTH=1200`, `SLOT_TIME=2`, `MIN_STAKE_WEI=...`, `UNBONDING_PERIOD=1209600`, `SLASH_DOUBLE_BPS=750`, `SLASH_SURROUND_BPS=300`, `SLASH_DOWNTIME_BPS=50`, `TREASURY_ADDR=...`.
- L2: `CHECKPOINT_INTERVAL_SEC=300`, `CHECKPOINT_THRESHOLD_BPS=6667`, `L2_VALIDATOR_SOURCE=L1_STAKE`.
- L3: `BATCH_INTERVAL_SEC=10`, `OUTPUT_INTERVAL_SEC=120`, `CHALLENGE_WINDOW_SEC=604800`, `DA_MODE=L2_CALLDATA`.

### Deployment script hooks
- `contracts/scripts/deploy_futuristic_stack.ts` reads:
  - `UNBONDING_PERIOD` (sec), `MIN_STAKE_WEI`, `DOWNTIME_SLASH_BPS`
  - `L3_CHALLENGE_WINDOW` (sec) for output finalization
  - `L2_CHECKPOINT_INTERVAL` (sec; informational)
- Registers deployed addresses into `AddressBook` for off-chain consumers.

### Implementation hooks in repo
- L1 PoS: extend `StakingManagerV2` unbonding params and hook downtime evidence into `SlashingManagerV2`; rotate sets via `EpochManager`.
- L2 checkpoints: use `CheckpointManager` on L1; add L2 off-chain component to collect sigs and submit.
- L3 fault proofs: wire `FinalizationManager` to real dispute games and DA inclusion checks.
- Deployment: use `contracts/scripts/deploy_futuristic_stack.ts` and surface the above params via env/config; register addresses in an `AddressBook` for services.
