# GhostChain Liquidity Gravity Engine (LGE) — Whitepaper (v2, Plain Language)

_Version: 2.0 | Date: 2026-03-10_

## Executive summary

The Liquidity Gravity Engine (LGE) is a governance-locked system that can deploy a bounded amount of capital from GhostChain L1 to external execution venues (EVM chains) to earn yield and fees, while requiring that **all yield/fees settle back to GhostChain L1**. GhostChain L1 is the canonical ledger for accounting and distribution of those proceeds.

LGE is designed so that automation can propose and perform actions, but **cannot exceed on-chain limits** and cannot continue operating when settlement is overdue (“no settlement → no continuation”).

## Problem statement

Protocols often earn yield across multiple venues (staking, liquidity provision, etc.), but fragmented accounting and weak controls can create:

- unclear ownership and reconciliation of yield
- hidden leverage and unbounded exposure
- delayed or missing repatriation of proceeds
- operational risk from autonomous agents without clear constraints

LGE addresses these risks by making GhostChain L1 the single source of truth for:

- deployed principal (what left the vault and to where)
- settlement proofs (what was earned and returned)
- distribution of proceeds (policy-owned liquidity, burn, validator rewards)

## System overview

LGE consists of:

- **On-chain contracts (GhostChain L1)**
  - `LoadBalancerVault`: holds assets, issues shares, enforces caps/cooldowns/withdrawal constraints.
  - `AdapterRegistry`: governance list of allowed external venues and their risk parameters.
  - `SettlementOracle`: canonical accounting and settlement-proof verification; blocks continuation when settlement is overdue.
  - `RewardRouter`: governance-configured distribution of settled yield.
  - `CircuitBreaker`: pausing and rate limiting.
  - `OperatorBondVault`: operator bonds for slashing/penalties.

- **Off-chain router + relayers**
  - Proposes and executes deploy/unwind within on-chain rules.
  - Collects receipts and submits settlements with threshold relayer attestations.
  - Maintains append-only, signed audit logs for reproducibility.
## AI Layer and Autonomous Integration

GhostChain's LGE is now integrated with the Global AI Orchestrator (`ai-orchestrator/`) introduced in Phase 6.

### What the AI layer does in LGE

- **Economic Agent** (`agents/economic_agent.ts`): issues rebalance and settlement-window advisory proposals based on on-chain `SettlementOracle` data.
- **`demand_analyzer`** (`economic-ai/demand/`): tracks adapter utilization, yield rates, and settlement latency to guide governance proposals.
- **`supply_controller`** (`economic-ai/`): adjusts recommended deployment caps and cooldown parameters based on oracle state.
- **GhostBrain Core** (`:7900`): risk-scores adapter positions and flags anomalous settlement gaps for operator review.

### Safety guarantees

The AI layer can never:
- Execute on-chain deployments directly.
- Override `SettlementOracle.canContinue()` results.
- Modify adapter allowlists or caps without governance ratification.

All AI-generated proposals are submitted to the signing relay (`:7910`) with `requires_human_review: true` before any on-chain action.

### Orchestrator circuit-breaker

`TaskScheduler` in `ai-orchestrator/scheduler/` maintains a per-agent circuit-breaker. If `PolicyGuard` returns DENY for three consecutive LGE-related tasks, the economic agent is paused and an operator alert is issued.
## Canonical accounting and “no settlement → no continuation”

Two key rules:

1. **GhostChain L1 is canonical.** External chains do not mint Ghost-native assets for this system. External activities produce receipts/commitments only.
2. **No settlement → no continuation.** If an adapter has outstanding principal and settlement is overdue, on-chain checks prevent new deployments until settlement is submitted and governance unpauses (if paused by safety logic).

This is enforced by `SettlementOracle.canContinue(adapterId)` and the vault gating on `requireCanContinue(adapterId)` for deployments.

## Governance and controls

All adapter and risk configuration is controlled by governance:

- adapter allowlisting and parameter updates (`AdapterRegistry`)
- caps and settlement interval requirements
- emergency pause and deploy-rate limits (`CircuitBreaker`)
- reward distribution configuration with a mandatory activation delay (`RewardRouter`)
- operator bond parameters and slashing authority (`OperatorBondVault`)

## Settlement proofs (MVP)

For the MVP, settlement proofs use **threshold ECDSA attestations** from an authorized relayer set.

Each settlement includes:

- adapter id and settlement asset
- yield amount and fee amount
- a commitment hash (derived from external receipts/observations)
- a strictly increasing sequence number (replay protection)
- an issuance time + expiry window

The settlement submission requires transferring the settlement asset into the oracle (no minting), and then routes yield through `RewardRouter`.

## Distribution of proceeds

Settled yield is distributed on GhostChain L1 using governance-configured basis-point splits:

- protocol-owned liquidity receiver (POL)
- buyback + burn receiver (or on-chain burn for gas token if configured)
- validator reward receiver

## Auditability and reproducibility

Every router action is recorded in an append-only, signed audit log that includes:

- timestamps
- policy snapshot hash
- transaction hashes (when executed)
- expected vs realized yield (where available)
- justification / risk signals

These records are intended to be “court-ready”: independently reproducible from on-chain data and the logged commitment inputs.

## Limitations and roadmap

MVP limitations:

- Operator custody remains supported for dev/MVP; production should use bridge escrow custody and withdraw-only external-chain accounts.
- ZK settlement verification is pluggable, but production requires audited circuits/verifiers and governance-controlled rotation.
- Canonical GhostChain DEX integration requires a reviewed `IDexAdapter` implementation; the repo includes a dev reference adapter.

Roadmap:

- Harden ZK settlement proof verification (production circuits/verifiers, prover pipeline).
- Expand custody hardening (bridge escrow defaults, richer reconciliation, fraud proofs).
- Integrate the canonical GhostChain DEX via a production adapter (TWAP/slippage policy enforcement).
