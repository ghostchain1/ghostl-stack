# Sovereign Engine Certification

## Architecture Diagram

```mermaid
flowchart LR
  L3[L3 Utility Revenue]\nGas + Deploy + SDK + Commission --> L3C[l3-fee-collector]
  L3C -->|L3->L2 only| L2A[l2-revenue-aggregator]
  L2A -->|L2->L1 only| L1T[treasury-engine (L1)]
  L1T --> YR[Yield Router / Adapters]
  YR -->|Yield Return| L1T
  L1T --> RD[reward-distributor]
  RD --> L2I[L2 Incentive Pool]
  RD --> L3I[L3 Event Incentives]
```

## Treasury Flow Diagram

```mermaid
sequenceDiagram
  participant L3 as L3 Fee Collector
  participant L2 as L2 Revenue Aggregator
  participant L1 as Treasury Engine
  participant Y as Yield Adapter
  participant R as Reward Distributor

  L3->>L2: signed fee event
  L2->>L2: fraud checks + deterministic batch
  L2->>L1: revenue-intake batch
  L1->>L1: update treasury balance
  L1->>L1: governance+timelock verify
  L1->>Y: deploy allocation
  Y-->>L1: yield return
  L1->>R: net-yield distribution input
  R->>R: timelock + cycle execution
```

## Governance Enforcement Diagram

```mermaid
flowchart TD
  Req[Capital Deployment Request] --> Check1{approval.json exists?}
  Check1 -- no --> Deny1[Abort]
  Check1 -- yes --> Check2{quorumReached == true?}
  Check2 -- no --> Deny2[Abort]
  Check2 -- yes --> Check3{timelockExpiresAt <= now?}
  Check3 -- no --> Deny3[Abort]
  Check3 -- yes --> Check4{emergency halt / pause enabled?}
  Check4 -- yes --> Deny4[Abort]
  Check4 -- no --> Execute[Execute Allocation]
```

## Deployment Checklist

- [ ] `bash scripts/verify-routing.sh`
- [ ] `bash scripts/verify-governance.sh --proposal-id <id>`
- [ ] `docker compose -f docker-compose.sovereign.yml config`
- [ ] `docker compose -f docker-compose.sovereign.yml up -d --build`
- [ ] `bash scripts/smoke/sovereign-economy.sh`
- [ ] `curl -fsS http://localhost:7683/v1/treasury/proof`

## Production Readiness Checklist

- [ ] Routing-law hard checks enabled at ingress and batching stages
- [ ] Governance lock validates quorum + timelock for execution paths
- [ ] Emergency halt + pause controls tested
- [ ] Metrics scraped in Prometheus for all four services
- [ ] Alert rules loaded and firing tested
- [ ] SQLite ledgers backed up and recovery procedure validated
- [ ] Contract tests pass (`npm --prefix contracts run test:sovereign`)

## Risk Disclosure Summary

- External yield adapters are pluggable and may fail or underperform.
- SQLite storage is single-node; multi-region HA requires replication strategy.
- Numeric precision in service-level metrics is approximate (Prometheus float conversion).
- Governance file-based gate is strong for deploy pipelines but must be paired with on-chain validation in production governors.
