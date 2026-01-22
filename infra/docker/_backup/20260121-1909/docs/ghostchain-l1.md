# Ghostchain L1 (local dev chain)

The L1 for this stack is a standalone Ghostchain instance (dev geth) running on chainId 1337. It is independent of Ethereum mainnet/sepolia and is the base security layer for the broader GhostChain PoS + OP Stack blueprint described in `docs/ghostchain-pos-alignment.md`.

## PoS Blueprint Highlights

GhostChain L1 implements a BFT-style PoS with the following defaults:

* **Finality:** economic finality via ≥2⁄3 attested checkpoints, stored on chain as `finalized_checkpoint`.
* **Epochs:** 900–1,800 blocks (~30–60 minutes), validator set rotates every epoch and the block proposer/attesters are stake-weighted.
* **Staking:** 2s target block time, 50–200 active validators, delegation allowed, unbonding 7–21 days, per-validator caps to keep committees manageable.
* **Slashing:** double-sign (5–10% + exit), surround votes (1–5% + jail), downtime (jail + small penalty). Guard contracts handle evidence ingestion and slashing actions.
* **Rewards:** proposer (base + tips), attesters (shared pot), delegators (proportional minus commission), governed via timelocked proposals and guardians.

Contracts that mirror this blueprint reside in `contracts/src/futuristic`: `StakingManagerV2`, `ValidatorRegistryV2`, `SlashingManagerV2`, `RewardDistributorV2`, `EpochManager`, `CheckpointManager`, `GovernanceToken/GovernorV2`, and allied automation/oracle contracts.

## Alignment with L2/L3

* **L2 (PolyBFT)** anchors to this L1 via checkpoints every 2–10 minutes (`CheckpointManager`). The L2 rollup derives its validator set from L1 staking or a permissioned subset and publishes checkpoint roots back to L1.
* **L3 (OP Stack)** settles to L2: sequencer batches → L2 batches, output roots go to `OutputOracle`/`FinalizationManager`, and disputes run via `DisputeGameFactoryV2`.
* **Finality ladder:** L3 soft → L2 settlement → L1 economic finality. Withdrawals depend on the challenge windows configured on L2/L3.

For the full blueprint, see `docs/ghostchain-pos-alignment.md`, which includes roles, numbers, network requirements, and the upgrade phases (Ship → Harden → Decentralize).

- RPC (inside compose): `http://l1:8545`
- RPC (host): `http://localhost:18545`
- Chain ID: `1337`
- Config files: `infra/opstack/config/l1-chain.json` (chain params), `infra/opstack/config/l1-genesis.json`
- Rollup config points to Ghostchain L1 via `infra/opstack/config/rollup.json` (l1_chain_id=1337, genesis hash matches Ghostchain).

Running:
```bash
docker compose -f infra/opstack/docker-compose.yml up -d l1
```

If you want to regenerate Ghostchain with a new chainId or genesis, update `infra/opstack/config/l1-chain.json` and `infra/opstack/config/l1-genesis.json`, clear `infra/opstack/data/l1-geth*`, and restart the stack.
