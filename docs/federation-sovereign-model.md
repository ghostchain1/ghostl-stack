# Federation Sovereign Model

## Overview

Federation extends the sovereign treasury model with member-level policy constraints while preserving constitutional routing:

- L3 -> L2 -> L1 only
- Treasury capital deployment remains L1-governed
- Federation members receive policy-bound distributions only
- No direct member withdrawals from root treasury

## Governance Diagram

```mermaid
flowchart LR
  DAO[Governance DAO] --> TL[Timelock Executor]
  TL --> FR[FederationRegistry]
  TL --> FP[FederationPolicy]
  TL --> TE[Treasury Engine]
  TE --> RD[Reward Distributor]
```

## Policy Gating Diagram

```mermaid
flowchart TD
  A[Allocation Request] --> B{Member Context Provided?}
  B -- no --> X[Reject]
  B -- yes --> C{Member Active?}
  C -- no --> X
  C -- yes --> D{Chain Allowed?}
  D -- no --> X
  D -- yes --> E{Risk <= Member Cap?}
  E -- no --> X
  E -- yes --> F{Exposure <= Member Cap?}
  F -- no --> X
  F -- yes --> G[Queue/Execute via Governance]
```

## Revenue Distribution Diagram

```mermaid
flowchart LR
  L3[L3 Utility Revenue] --> L2[L2 Revenue Aggregator]
  L2 --> L1[L1 Treasury Engine]
  L1 --> Y[Yield Allocation]
  Y --> R[Reward Distributor]
  R --> GP[Global Pool]
  R --> MP[Member Pools]
  R --> EP[Event Incentives]
```

## Runtime Controls

- `services/treasury-engine` enforces federation policy file checks at allocation time.
- `services/reward-distributor` rejects non-compliant member pools in reward cycles.
- Prometheus exposes:
  - `federation_members_active`
  - `treasury_exposure_by_member`
  - `policy_violations_total`
