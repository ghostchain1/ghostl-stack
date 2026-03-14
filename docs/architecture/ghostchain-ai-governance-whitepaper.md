# GhostChain AI Governance Whitepaper

Version: 2.0
Date: 2026-03-10

## Executive summary

GhostChain implements a multi-layer AI governance model where deterministic validator consensus finalizes blocks and a structured AI plane proposes — but never executes — operational policy changes. The AI plane is constitutionally bounded, governance-locked, and fully auditable. This document describes the system, authority model, evidence chain, Phase 6 AI Orchestrator details, due process, and reproducibility steps so auditors and regulators can verify every action.

## System overview

GhostChain separates consensus from policy across three AI tiers:

1. **Base consensus plane (deterministic)**
   - Validators finalize blocks via deterministic CometBFT consensus.
   - Fork choice, block ordering, and finality are never influenced by AI.

2. **AI governance plane (policy only)**
   - AI services observe, simulate, and propose policy changes.
   - Proposals are executed only after on-chain governance ratification.
   - Validators enforce policy deterministically after ratification.

3. **Global AI Orchestrator plane (Phase 6+)**
   - Routes tasks across specialized agents (economic, governance, security, infrastructure).
   - Enforces `PolicyGuard` on every task before dispatch.
   - Acts as the coordination layer between GhostBrain Core and all governance signal producers.

The AI plane can recommend actions but cannot modify chain state without governance approval.

## Phase 6+ AI Orchestrator Architecture

### Core Components (`ai-orchestrator/`)

| Module | File | Role |
|---|---|---|
| Orchestrator Core | `core/orchestrator.ts` | Routes tasks, enforces policy, manages lifecycle |
| PolicyGuard | `safety/policy_guard.ts` | ALLOW / DENY / REQUIRE_HUMAN_APPROVAL per task type |
| TaskScheduler | `scheduler/task_scheduler.ts` | Priority queue + circuit-breaker |
| Telemetry | `telemetry/orchestrator_telemetry.ts` | Prometheus metrics for all agent actions |

### Agent Roster

| Agent | File | Domain |
|---|---|---|
| Economic Agent | `agents/economic_agent.ts` | Treasury, rewards, tokenomics |
| Governance Agent | `agents/governance_agent.ts` | Proposal routing, bypass detection |
| Security Agent | `agents/security_agent.ts` | Anomaly, fraud, circuit-breaker |
| Infrastructure Agent | `agents/infrastructure_agent.ts` | VM health, GAIS relay |

### Governance Agent — Routing-Bypass Detection

`governance_agent.ts` polls both EVM (GhostChain L1 + L2) and Cosmos governance endpoints. Key invariants enforced:

- **L3→L1 direct call detection**: if a cross-layer message skips L2, the agent escalates a CRITICAL alert to the signing relay (`:7910`) with `requires_human_review: true`.
- **Low governance participation**: if voter turnout falls below threshold, the agent issues an advisory proposal to extend the voting period.
- **Emergency proposals**: any proposal tagged SECURITY or CRITICAL bypasses the normal queue and routes directly to signing relay.

## Python Swarm (Phase 7)

The `ai-orchestrator/agents/` TypeScript agents are complemented by a Python swarm in `ghost-brain-core/`:

- **`evolution/`**: self-improvement planning (advisory only, never modifies running code autonomously).
- **`orchestrator/networking/routing_engine.py`**: routes AI tasks within the swarm using internal HTTP handlers.
- **`infrastructure/supervisor/`**: GAIS (GhostAI Supervisor) — manages VM/container lifecycle within `VM_ALLOWLIST` and `CONTAINER_ALLOWLIST`.

All Python swarm outputs are routed through the Orchestrator Core before reaching any governance endpoint.

## GAIS — Autonomous Infrastructure Safety

`infra/hypervisor/supervisor/ghostais.py` provides VM auto-management with hard safety constraints:

- **Allowlists**: `VM_ALLOWLIST` and `CONTAINER_ALLOWLIST` control what may be auto-restarted. Empty = no action.
- **Cooldown**: 120 s per VM restart.
- **Circuit breaker**: max 4 restarts per hour per VM; further restarts require operator approval.
- **DRY_RUN**: `VM_MANAGER_DRY_RUN=1` logs all actions without executing them (mandatory for staging).
- **Snapshots**: created before every hard-restart or reboot when `VM_SNAPSHOT_ENABLED=1`.

GAIS never modifies consensus parameters, validator quorum, or bridge addresses.

## Authority model

Roles and responsibilities:

- **AI proposer**: generates policy update proposals and evidence bundles.
- **Governance authority**: validates and ratifies proposals on-chain.
- **Validators**: enforce the active policy retrieved from on-chain registries.
- **Operators**: execute runbooks and incident response procedures.
- **GAIS**: auto-restarts whitelisted VMs/containers within circuit-breaker limits.

Authority boundaries:

- AI may propose, explain, and advise policy changes.
- AI may not execute state changes without on-chain governance ratification.
- GAIS may auto-restart whitelisted infrastructure within circuit-breaker limits only.
- Validators enforce only ratified policies and ignore AI intent.

## Governance and execution flow

1. **Observation and analysis (off-chain)**
   - AI services collect metrics, logs, and chain signals.
   - GhostBrain Core (`:7900`) provides risk scores and anomaly signals.
   - Simulations produce expected outcomes and rollback plans.

2. **Proposal creation (off-chain)**
   - A deterministic policy update payload is generated.
   - Evidence bundle is hashed, includes explainability metadata, and committed on-chain.
   - CRITICAL/SECURITY tasks → signing relay (`:7910`) immediately, skipping normal queue.

3. **Ratification (on-chain)**
   - Governance validates a proposal and signs for execution.
   - The proposal is executed through an on-chain executor with quorum and invariant checks.
   - `GhostChainGovernor` and `GhostConstitution` enforce supermajority + timelock.

4. **Enforcement (validator)**
   - Validators read active policies from on-chain registries.
   - Policy enforcement is deterministic and bounded by invariants.

## Chain of custody and evidence

Evidence is recorded as immutable hashes and linked to proposals:

- Evidence bundles are hashed with deterministic serialization.
- Evidence hashes are committed to on-chain vaults with proposal linkage.
- Proposals reference evidence hashes, inputs hashes, and policy versions.
- Operator runbooks archive evidence bundles, proposal payloads, and signer sets.
- `TaskScheduler` telemetry tracks every agent task from dispatch to completion.

This ensures a complete audit trail for every policy update.

## Explainability and due process

For each AI policy proposal:

- Rationale and expected impact are recorded in explainability metadata.
- Simulation inputs and results are recorded in evidence bundles with inputs hashes.
- A rollback plan is required for any change with non-trivial impact.
- Human review is mandatory prior to on-chain ratification.
- Proposals missing explainability or signature quorum are rejected.

Dispute and appeal:

- Operators can halt or throttle actions via governance-approved guards.
- Governance can roll back policies by executing new proposals.

## Risk and liability analysis

Key risks and mitigations:

- Unauthorized execution: blocked by on-chain executor checks and signature thresholds.
- Policy drift: mitigated by explicit policy versioning and bounded parameter ranges.
- Evidence tampering: prevented by hashing and on-chain commitments.
- AI misclassification: mitigated by human review and multi-party governance.
- Emergency overreach: limited by time-bound emergency policies and expiration.

## Reproducibility instructions

Auditors can reproduce and verify governance actions by:

1. Fetching the proposal payload (evidence hash, inputs hash, policy key, value, timestamps).
2. Verifying the evidence bundle hash matches the on-chain EvidenceVault record.
3. Verifying EIP-712 signatures and quorum thresholds on-chain.
4. Replaying simulations using the recorded inputs hash and inputs bundle.
5. Confirming policy state in the on-chain registry matches the proposal.

## Evidence appendix

Evidence locations used by runbooks:

- AI policy evidence: `services/ghost-gas-engine/data/evidence`
- AI policy proposals: `services/ghost-gas-engine/data/proposals`
- AI monitor action evidence: `services/ai-monitor/data/evidence`
- Evidence packs: `infra/evidence/out/`

Each evidence artifact includes:

- Policy key and policy version
- Evidence hash, metadata hash, and inputs hash
- Explainability summary and simulation references
- Proposal identifiers and signature set

## Cryptographic glossary

- Hash: A deterministic digest (Keccak-256) of evidence or proposal data.
- Evidence hash: Hash of the evidence bundle used to justify a policy update.
- Metadata hash: Hash of proposal metadata for audit linkage.
- EIP-712 digest: Typed data hash used for signer attestations.
- Signature quorum: Minimum number of valid signatures required to execute a policy update.
- On-chain registry: Smart contracts storing active policies and invariant bounds.

## Implementation references

Primary components:

- Policy registry and executor contracts (on-chain)
- Evidence vault contracts (on-chain)
- AI proposal generation: `services/ghost-gas-engine`
- AI monitoring and gating: `services/ai-monitor`
- Runbooks: `docs/ops/runbook-l1.md`, `docs/ops/runbook-l2.md`, `docs/ops/runbook-l3.md`
- Ratification workflow: `docs/ai-core/ratification.md`
- Ratification package: `docs/ghostchain/ratification-package.md`

This whitepaper is intended to be self-contained and court-ready. It provides both operational and cryptographic verification steps to prove every policy action is governed, bounded, and reproducible.
