# GhostContractAI — Architecture

## System Overview

```
┌──────────────────────────────────────────────────────────┐
│              GhostContractAI Service (port 7610)          │
│                                                           │
│  REST API ──► Pipeline Runner ──► Auditor Worker         │
│     │               │                    │               │
│   RBAC          Async Jobs          Evidence Pack         │
│     │               │                    │               │
│  Auth/JWT      Job Store (mem)      Prom Metrics          │
└─────────────────────────────────────────────────────────--┘
         │               │                 │
    L1 RPC          L2 RPC           L3 RPC
    GhostChain      GhostL2          GhostL3
         │
    ┌────┴────────────────────────────────────┐
    │           On-Chain Contracts (L1)        │
    │  GhostContractRegistry                  │
    │  GhostUpgradeGovernor  (+ timelock)     │
    │  GhostPolicyGate       (hash commits)   │
    │  GhostRiskOracle       (EIP-712 scores) │
    └─────────────────────────────────────────┘
```

## Hard Routing Law

```
L3 ──(L3→L2 only)──► L2 ──(L2→L1 only)──► L1 (root)
 ✗ L3 → L1 bypass BLOCKED
 ✗ L2 → L3 downward BLOCKED
 ✗ L1 outbound registry links BLOCKED
```

Enforced in:
1. `GhostContractRegistry.sol` — on-chain revert on illegal `ChainLink` registration
2. `services/ghostcontract-ai/src/routing-law.ts` — API-level rejection + metric
3. `contracts/src/ghostcontract-ai/constraints.yaml` — hashed constitution
4. `.github/workflows/ghostcontract-ai.yml` — CI check

## Pipeline Flow

```
Request → RBAC → RoutingLawCheck → [DryRun?] → Pipeline
                                         │
                                    Yes: return plan
                                         │
                                    No:  forge build
                                         forge test (+ invariants)
                                         slither
                                         policy-gate hash verify
                                         SLSA provenance
                                         forge script deploy (broadcast)
                                         on-chain registry record
                                         evidence pack generation
```

## Upgrade Governance Flow

```
Proposer (GhostContractAI)
  │
  ├─ POST /pipelines/upgrade (proposal-only)
  │    └─ GhostUpgradeGovernor.propose()
  │         ├─ riskScore >= 70 → Quarantined
  │         └─ riskScore < 70 → Pending
  │
  ├─ N approvers → GhostUpgradeGovernor.approve() × N (quorum)
  │    └─ quorum met → Approved (time-lock starts)
  │
  ├─ Time-lock expires → GhostUpgradeGovernor.queue()
  │
  └─ Executor → GhostUpgradeGovernor.execute(policyHash)
       └─ actualPolicyHash == committedPolicyHash → Executed
```

## Data Stores

| Store | Type | Notes |
|---|---|---|
| Pipeline jobs | In-memory Map | Replace with Redis + BullMQ for prod |
| On-chain registry | Solidity mappings | Permanent; L1 is source of truth |
| Evidence packs | In-process + JSON | Emit to IPFS/Arweave for mainnet |
| Metrics | Prometheus | Scraped by observability stack |

## Contract Roles Matrix

| Role | Registry | Governor | PolicyGate | RiskOracle |
|---|---|---|---|---|
| `DEFAULT_ADMIN_ROLE` | topology + grants | config + grants | grants | grants |
| `REGISTRAR_ROLE` | register/deactivate/link | — | — | — |
| `AUDITOR_ROLE` | (read) | — | checkAndRecord | (read) |
| `PROPOSER_ROLE` | — | propose | — | — |
| `APPROVER_ROLE` | — | approve | — | — |
| `EXECUTOR_ROLE` | — | queue + execute | — | — |
| `GUARDIAN_ROLE` | — | cancel + pause | — | — |
| `POLICY_AUTHOR_ROLE` | — | — | commitPolicy | — |
| `ATTESTOR_ROLE` | — | — | — | submitAttestation |

## Security Model

- **No key material in logs** — logger redacts `key`, `secret`, `token`, `privateKey`, `mnemonic`, etc.
- **Vault-first signing** — keys loaded from HashiCorp Vault transit; ENV fallback only for devnet/CI
- **DRY_RUN by default** — GHOSTAI_DRY_RUN=true unless explicitly overridden + governance approval
- **Policy hash on-chain** — constraints.yaml SHA256 committed to GhostPolicyGate; mismatch hard-fails
- **EIP-712 risk attestations** — AI risk scores are signed and stored on GhostRiskOracle for auditability
- **Break Glass** — emergencyPause() blocks all proposals; requires postmortem before unpause
