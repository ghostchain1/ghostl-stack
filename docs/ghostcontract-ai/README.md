# GhostContractAI

Autonomous AI Smart Contract Management System for GhostStack (GhostChain L1 + GhostL2 + GhostL3).

## Overview

GhostContractAI manages the **full smart contract lifecycle** across all three layers of the GhostChain stack: create, compile, test, audit, deploy, verify, upgrade, pause, rollback, and deprecate — all governed by an on-chain policy gate and constitutional constraints.

**Hard invariant — routing law:**
```
L3 → L2 ONLY
L2 → L1 ONLY
No direct L3 → L1 bypass. No external cross-chain calls except via GhostChain (L1).
```

## Components

| Component | Location | Description |
|---|---|---|
| `GhostContractRegistry.sol` | `contracts/src/ghostcontract-ai/` | On-chain deployment registry with routing-law enforcement |
| `GhostUpgradeGovernor.sol` | `contracts/src/ghostcontract-ai/` | Upgrade governor with timelock, multi-sig, quarantine |
| `GhostPolicyGate.sol` | `contracts/src/ghostcontract-ai/` | On-chain policy hash commitments |
| `GhostRiskOracle.sol` | `contracts/src/ghostcontract-ai/` | EIP-712 signed AI risk attestations |
| `ghostcontract-ai` service | `services/ghostcontract-ai/` | TypeScript REST service: pipelines, RBAC, evidence packs |
| `constraints.yaml` | `contracts/src/ghostcontract-ai/` | Constitutional constraints (hashed on-chain) |
| CI workflow | `.github/workflows/ghostcontract-ai.yml` | Full automated verification pipeline |
| Grafana dashboard | `grafana/dashboards/ghostcontract-ai.json` | Observability dashboard |

## Quick Start (Devnet)

```bash
# 1. Deploy on-chain contracts (dry-run first)
cd contracts
GHOSTAI_DEPLOY=false forge script scripts/ghostcontract-ai/deploy_l1.s.sol \
  --rpc-url $L1_RPC_URL --verbosity 2

# 2. Run live deploy (after verification)
GHOSTAI_ADMIN=0x... GHOSTAI_DEPLOY=true \
  forge script scripts/ghostcontract-ai/deploy_l1.s.sol \
  --rpc-url $L1_RPC_URL --broadcast

# 3. Start the GhostContractAI service
cd services/ghostcontract-ai
pnpm install && pnpm dev

# 4. Or via Docker Compose
docker compose up ghostcontract-ai
```

## REST API

| Method | Path | Role | Description |
|---|---|---|---|
| `POST` | `/pipelines/compile-test` | operator | Run Foundry build + tests |
| `POST` | `/pipelines/security-audit` | auditor | Slither + risk score |
| `POST` | `/pipelines/deploy` | governor | Deploy (routing-law enforced) |
| `POST` | `/pipelines/upgrade` | governor | Upgrade proposal (governance required) |
| `POST` | `/pipelines/verify` | operator | Block explorer verification |
| `POST` | `/pipelines/rollback` | governor | Rollback (governance required) |
| `GET` | `/registry/contracts` | viewer | List registered contracts |
| `GET` | `/registry/deployments?chain=L2` | viewer | Deployments by chain |
| `GET` | `/reports/:pipelineId` | viewer | Pipeline report |
| `GET` | `/health` | — | Health + layer status |
| `GET` | `/metrics` | — | Prometheus metrics |

## RBAC Roles

| Role | Allowed |
|---|---|
| `viewer` | Read-only (reports, registry) |
| `operator` | compile-test, verify |
| `auditor` | security-audit + operator |
| `governor` | deploy, upgrade, rollback + all above |

Pass the `X-Role` header in devnet. Replace with JWT + Keycloak in production.

## Default: DRY RUN Mode

All pipeline actions default to **dry-run** (`GHOSTAI_DRY_RUN=true`). To enable live broadcasting:

```bash
GHOSTAI_DRY_RUN=false   # enable broadcast
# + governance-signed approval reference required for deploy/upgrade/rollback
```

## Routing Law Enforcement

Every API call that specifies a `chain` parameter is validated against the routing law topology. Violations produce a `ROUTING_LAW_VIOLATION` HTTP 400 error and increment the `ghostcontract_ai_routing_law_violations_total` Prometheus metric.
