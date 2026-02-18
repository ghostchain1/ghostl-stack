# Liquidity Gravity + Constitutional Federation Governance — Dependency Graph

This document is the Phase 0 repository analysis artifact: it maps the on-chain and off-chain components that compose the GhostChain Liquidity Gravity Engine (LGE) and the constitutional, federated governance plane for GhostL2/GhostL3.

## High-level graph (conceptual)

```mermaid
flowchart LR
  subgraph L1["GhostChain L1 (Canonical Ledger)"]
    GOV["GhostChainGovernor (custom)"]
    EXEC["ProposalExecutor (timelock+constitution guard)"]
    CONS["GhostConstitution + ConstitutionalGuard"]
    CONSTREG["ConstitutionRegistry (amendment rules)"]
    POLICY["PolicyRegistry (on-chain policies)"]
    LGEV["LoadBalancerVault"]
    LGER["AdapterRegistry"]
    LGEOR["SettlementOracle"]
    LGERW["RewardRouter"]
    LGECB["CircuitBreaker"]
    LGEBOND["OperatorBondVault"]
    STAKE["StakingManager (snapshot stake votes)"]
    VALV["ValidatorSetVotes (snapshot validator votes)"]
    FED["FederationCouncil (L1 clearance)"]
    ADL2["L1 Bridge Adapter (L2)"]
    ADL3["L1 Bridge Adapter (L3)"]
  end

  subgraph Offchain["Off-chain Autonomy (Bounded by Constitution + Policy)"]
    ROUTER["services/liquidity-router"]
    PROVER["services/liquidity-prover (optional)"]
    CTL["tools/liquidityctl"]
    AUDIT["Append-only audit logs"]
  end

  subgraph L2L3["GhostL2 / GhostL3 (Execution Venues)"]
    MSG["common/XDomainMessenger (hierarchical)"]
    BR["L2L3Bridge (dev token bridge demo)"]
    FEDTL["FederatedTimelock (constitutional gate)"]
    ATTEST["ProposalAttestor (attestation hash)"]
    CLR["Clearance Adapter (receives L1 clearance)"]
  end

  subgraph Obs["Observability"]
    PROM["Prometheus"]
    GRAF["Grafana"]
  end

  GOV --> EXEC
  EXEC --> CONS
  GOV --> CONSTREG
  GOV --> POLICY
  GOV --> STAKE
  GOV --> VALV
  ATTEST -->|attest via bridge| ADL2
  ATTEST -->|attest via bridge| ADL3
  ADL2 --> FED
  ADL3 --> FED
  FED -->|clearance via bridge| CLR
  CLR --> FEDTL

  LGEV --> LGER
  LGEV --> LGECB
  LGEV --> LGEOR
  LGEOR --> LGERW
  LGEOR --> LGEBOND

  ROUTER -->|reads| POLICY
  ROUTER -->|reads/writes (governed)| LGEV
  ROUTER -->|submits settlements| LGEOR
  ROUTER --> AUDIT

  ROUTER --> PROM
  PROM --> GRAF
```

## On-chain: Liquidity Gravity Engine (L1)

Primary implementation lives under:

- `contracts/src/liquidity/LoadBalancerVault.sol` (vault + share accounting + deploy/unwind gating)
- `contracts/src/liquidity/AdapterRegistry.sol` (adapter allowlist + caps + settlement interval)
- `contracts/src/liquidity/SettlementOracle.sol` (canonical settlement accounting + proof verification + “no settlement → no continuation”)
- `contracts/src/liquidity/RewardRouter.sol` (deterministic reinjection routing; BPS split conservation; timelocked split activation)
- `contracts/src/liquidity/CircuitBreaker.sol` (global + per-adapter pause; deploy rate limits)
- `contracts/src/liquidity/OperatorBondVault.sol` (operator bonds; slashing hooks)
- `contracts/src/liquidity/BridgeEscrow.sol` (optional custody hardening via escrow + standard bridge)

Key invariant links:

- `LoadBalancerVault.deployToAdapter(...)` enforces `SettlementOracle.requireCanContinue(adapterId)` (deployment halts when settlement overdue).
- `SettlementOracle.submitSettlement(...)` is the sole ingress for yield into `RewardRouter.distribute(...)`.

## On-chain: Governance + Constitution (L1)

The production path for Liquidity Gravity + federation governance uses:

- `contracts/src/governance/GhostChainGovernor.sol` (custom governor; stake+validator weighted voting)
- `contracts/src/governance/ProposalExecutor.sol` (timelock + constitution guard execution plane)
- `contracts/src/governance/ConstitutionRegistry.sol` (dual quorum + supermajority + ratchet-only minima)

Constitution enforcement is implemented via:

- `contracts/src/GhostConstitution.sol` (action permissioning + ZK compliance hook)
- `contracts/src/common/ConstitutionalGuard.sol` (enforced by `ProposalExecutor.execute(...)`)

The policy plane is implemented via:

- `contracts/src/governance/PolicyRegistry.sol` (namespaced policy primitives + activation delays + emergency + rollback)

## Off-chain: Router + Tooling

- `services/liquidity-router`:
  - reads L1 contracts for adapter state, deployed principal, breaker state, settlement lag
  - submits settlement transactions (ECDSA quorum in MVP; ZK optional via `services/liquidity-prover`)
  - writes signed, append-only audit logs to `artifacts/audit/liquidity-router`
  - exports Prometheus metrics at `/metrics`
- `tools/liquidityctl`: CLI for status + proposal generation.

## Bridging / Messaging

This repo contains:

- `contracts/src/common/XDomainMessenger.sol`: a minimal hierarchical messenger (parent→child relay with authenticated sender)
- `contracts/src/l1/Messenger.sol`: a devnet inbox/outbox demo messenger
- `contracts/src/L2L3Bridge.sol`: a dev-only token bridge demo with policy/compliance gating

For federation governance, the bridge **must be abstracted** to only rely on:

- authenticated sender identity
- source domain id
- message execution on destination

The repository provides a devnet-capable adapter implementation based on `XDomainMessenger`:

- `contracts/src/governance/bridge/XDomainFederationCouncilAdapter.sol` (L1 receive attestations + send clearances)
- `contracts/src/governance/bridge/XDomainFederationClearanceAdapter.sol` (L2/L3 receive clearance → record into `FederatedTimelock`)

## Observability

- Devnet: `infra/docker/liquidity-gravity/*` (compose + prometheus + grafana)
- Repo-wide: `observability/*` (dashboards + rules)
