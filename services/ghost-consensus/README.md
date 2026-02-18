# ghost-consensus (skeleton)

Execution layout for GhostBFT consensus runtime:

- `ghostbft-node/`: proposer/prevote/precommit state machine wrapper
- `leader-election/`: deterministic leader rotation / VRF hooks
- `vote-gossip/`: validator vote transport and aggregation
- `finality/`: QC construction and finalized checkpoint emission

This folder is intentionally scaffold-only in this patch. The enforceable chain safety logic is added on-chain under:
- `contracts/src/governance/bridge/`
- `contracts/src/consensus-governance/`
- `contracts/src/OptimisticRollup.sol`
- `contracts/src/L2L3Bridge.sol`
