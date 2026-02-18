# AI Consensus + GhostChain Hub Architecture

This document codifies the deterministic AI consensus layer and routing topology:

- L1 GhostChain chain ID: `14000101`
- L2 GhostL2 chain ID: `901`
- L3 GhostL3 chain ID: `903`
- Cascading finality direction: `GhostL3 -> GhostL2 -> GhostL1`

## Invariants

1. Consensus remains deterministic and signature-driven.
2. AI outputs are treated as evidence and policy commitments, never subjective runtime opinions.
3. L2/L3 can settle only through GhostChain; external chain egress is initiated only from GhostChain.
4. L3 finality is valid only when its parent L2 root is itself finalized on L1.

## On-chain Components

- `contracts/src/consensus-governance/ConsensusEvidenceRootStore.sol`
- `contracts/src/consensus-governance/ConstitutionalUpgradeGate.sol`
- `contracts/src/consensus-governance/GhostChainBridgeHub.sol`
- `contracts/src/consensus-governance/GhostChainRouteGuard.sol`

### Responsibilities

- `ConsensusEvidenceRootStore`: records governance-approved evidence roots with validity windows.
- `ConstitutionalUpgradeGate`: requires audit root, AI risk summary hash, build attestation root, and rollback plan hash before authorization.
- `GhostChainBridgeHub`: accepts L2/L3 root postings to L1 and enforces `sourceLayer == L1` for external egress.
- `GhostChainRouteGuard`: validates GhostChain finality attestations signed by validator quorum before accepting cross-chain proofs.

## Off-chain Services

- `services/ghost-ai-consensus/`: deterministic scoring, proposer ranking, evidence-pack and replay APIs.
- `services/ghostchain-bridge-hub/`: operational bridge-hub API mirroring L1 routing constraints.
- `services/ghost-consensus/`: module scaffold for GhostBFT node, leader election, vote gossip, and finality.

## Compose Wiring

Use `docker-compose.ai-consensus.yml` for local bring-up:

```bash
docker compose -f docker-compose.ai-consensus.yml up -d --build
```

## Governance and Safety

- Policy/version changes should be applied at epoch boundaries.
- AI subsystem failures should fail to classical deterministic policy mode.
- Slashing and route denial actions should rely on evidence packs and validator-signed attestation paths.
