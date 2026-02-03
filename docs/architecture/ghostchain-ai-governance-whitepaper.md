# GhostChain AI Governance Whitepaper

Version: 1.1
Date: 2026-02-03

## Executive summary

GhostChain implements a dual-plane governance model where deterministic validator consensus finalizes blocks and an AI policy plane proposes, but never executes, operational policy changes. The AI plane is constitutionally bounded, governance-locked, and fully auditable. This document describes the system, authority model, evidence chain, due process, and reproducibility steps so auditors and regulators can verify every action.

## System overview

GhostChain separates consensus from policy:

1. Base consensus plane (deterministic)
   - Validators finalize blocks via deterministic consensus.
   - Fork choice, block ordering, and finality are never influenced by AI.

2. AI governance plane (policy only)
   - AI services observe, simulate, and propose policy changes.
   - Proposals are executed only after on-chain governance ratification.
   - Validators enforce policy deterministically after ratification.

The AI plane can recommend actions but cannot modify chain state without governance approval.

## Authority model

Roles and responsibilities:

- AI proposer: generates policy update proposals and evidence bundles.
- Governance authority: validates and ratifies proposals on-chain.
- Validators: enforce the active policy retrieved from on-chain registries.
- Operators: execute runbooks and incident response procedures.

Authority boundaries:

- AI may propose and explain policy changes.
- AI may not execute state changes without on-chain approvals.
- Validators enforce only ratified policies and ignore AI intent.

## Governance and execution flow

1. Observation and analysis (off-chain)
   - AI services collect metrics, logs, and chain signals.
   - Simulations produce expected outcomes and rollback plans.

2. Proposal creation (off-chain)
   - A deterministic policy update payload is generated.
   - Evidence bundle is hashed, includes explainability metadata, and is committed on-chain.

3. Ratification (on-chain)
   - Governance validates a proposal and signs for execution (EIP-712 signatures).
   - The proposal is executed through an on-chain executor with quorum and invariant checks.

4. Enforcement (validator)
   - Validators read active policies from on-chain registries.
   - Policy enforcement is deterministic and bounded by invariants.

## Chain of custody and evidence

Evidence is recorded as immutable hashes and linked to proposals:

- Evidence bundles are hashed with deterministic serialization.
- Evidence hashes are committed to on-chain vaults with proposal linkage.
- Proposals reference evidence hashes, inputs hashes, and policy versions.
- Operator runbooks archive evidence bundles, proposal payloads, and signer sets.

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
