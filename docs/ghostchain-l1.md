# GhostChain L1 (local dev chain)

GhostChain is the main Autonomous Layer 1 blockchain in this stack. For local development, we run a standalone GhostChain instance (dev geth) on chainId **14000101**. It is independent of public upstream networks and is the base security layer for the broader GhostChain PoS + OP Stack blueprint described in `docs/ghostchain-pos-alignment.md`.

> Note: the **devnet consensus engine is Clique (PoA)** for fast local iterations. The **PoS blueprint** is expressed in contracts under `contracts/src/futuristic` and can be activated in a production client later.

## PoS Blueprint Highlights

GhostChain L1 implements a BFT-style PoS with the following defaults:

* **Finality:** economic finality via ≥2⁄3 attested checkpoints, stored on chain as `finalized_checkpoint`.
* **Epochs:** 900–1,800 blocks (~30–60 minutes), validator set rotates every epoch and the block proposer/attesters are stake-weighted.
* **Staking:** 2s target block time, 50–200 active validators, delegation allowed, unbonding 7–21 days, per-validator caps to keep committees manageable.
* **Slashing:** double-sign (5–10% + exit), surround votes (1–5% + jail), downtime (jail + small penalty). Guard contracts handle evidence ingestion and slashing actions.
* **Rewards:** proposer (base + tips), attesters (shared pot), delegators (proportional minus commission), governed via timelocked proposals and guardians.

Contracts that mirror this blueprint reside in `contracts/src/futuristic`: `StakingManagerV2`, `ValidatorRegistryV2`, `SlashingManagerV2`, `RewardDistributorV2`, `EpochManager`, `CheckpointManager`, `GovernanceToken/GovernorV2`, and allied automation/oracle contracts.

## Execution + Networking (Devnet)
- **L1:** geth provides block structure, P2P networking, and state transition; chain params live in `infra/opstack/config/l1-chain.json`.
- **L2/L3:** op-geth/op-node provide execution + networking; rollup params live in `infra/opstack/config/rollup.json` and `infra/opstack/l3/<name>/config/rollup.json`.

## Alignment with L2/L3

* **L2 (OP Stack)** anchors to this L1 as an optimistic rollup: op-node/op-geth produce batches, and output roots + dispute data finalize via `OutputOracle`/`FinalizationManager`.
* **L3 (OP Stack)** settles to L2: sequencer batches → L2 batches, output roots go to `OutputOracle`/`FinalizationManager`, and disputes run via `DisputeGameFactoryV2`.
* **Finality ladder:** L3 soft → L2 settlement → L1 economic finality. Withdrawals depend on the challenge windows configured on L2/L3.

For the full blueprint, see `docs/ghostchain-pos-alignment.md`, which includes roles, numbers, network requirements, and the upgrade phases (Ship → Harden → Decentralize).

- RPC (inside compose): `http://l1:8545`
- RPC (host): `http://localhost:18545`
- Chain ID: `14000101`
- Config files: `infra/opstack/config/l1-chain.json` (chain params), `infra/opstack/config/l1-genesis.json`
- Rollup config points to GhostChain L1 via `infra/opstack/config/rollup.json` (l1_chain_id=14000101, genesis hash matches GhostChain).

Running:
```bash
docker compose -f infra/opstack/docker-compose.yml up -d l1
```

If you want to regenerate GhostChain with a new chainId or genesis, update `infra/opstack/config/l1-chain.json` and `infra/opstack/config/l1-genesis.json`, clear `infra/opstack/data/l1-geth*`, and restart the stack.
