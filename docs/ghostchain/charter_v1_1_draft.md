# GhostChain Constitutional Charter (Draft v1.1)

NOTE: This is a draft amendment to the devnet-ratified v1.0 charter at `docs/ghostchain/charter.md`.
Do not treat this document as ratified unless a new constitutional proposal is approved and executed.

## Preamble

We, the stewards, validators, builders, and participants of GhostChain, establish this Constitutional Charter to ensure that GhostChain operates as a secure, lawful, resilient, and human-governed digital protocol. This Charter defines the supreme principles, constraints, and governance mechanisms that bind GhostChain and all derivative layers.

GhostChain exists to provide neutral, verifiable, and accountable digital infrastructure while respecting human authority, legal systems, and societal norms.

## Article I - Sovereignty of Governance

1. Governance authority resides exclusively with human participants through defined on-chain and off-chain governance processes.
2. No autonomous system, artificial intelligence, or automated agent may unilaterally alter protocol state.
3. All protocol changes require proposal, review, vote, timelock, and execution phases.

## Article II - Role of Artificial Intelligence

1. AI systems may observe, analyze, simulate, and advise.
2. AI systems may propose policy changes only; execution and enforcement require governance ratification and validator enforcement.
3. AI systems may not execute transactions, sign messages, modify parameters, enforce policy, or control fork choice, block ordering, or finality.
4. AI authority is bounded by immutable guardrails (scope, expiry, and limits) recorded on-chain.
5. All AI outputs must be labeled as advisory and include confidence and provenance metadata.

## Article III - Safety, Immutability, and Rollback

1. Core protocol rules are immutable except through constitutional amendment.
2. All changes must include rollback plans and survivability analysis.
3. Emergency actions are subject to post-event governance ratification and forensic review.

## Article IV - Legal and Jurisdictional Compliance

1. GhostChain governance must account for applicable laws and regulations.
2. Jurisdictional conflicts automatically halt execution until resolved.
3. Evidence of compliance must be auditable and reproducible.

## Article V - Evidence and Accountability

1. All governance actions, proposals, and executions must be logged, hashed, and time-stamped.
2. Evidence must be independently verifiable and suitable for regulatory or judicial review.

## Article VI - Amendments

1. Amendments may be proposed by humans or AI (draft-only).
2. Amendments require enhanced disclosure, simulation, and approval thresholds.
3. Ratified amendments become binding constitutional law.

## Article VII - On-Chain Constitution and Monetary Policy

1. The on-chain execution guard is defined by `contracts/src/GhostConstitution.sol`.
2. Constitutional actions must emit on-chain events (see `docs/ghostchain/constitution_events.md`).
3. Cross-chain monetary policy must reconcile L1, L2, and L3 supply using deterministic proofs.
4. Public transparency artifacts are published for regulator review (see `docs/ghostchain/public_transparency_schema.json`).

## Article X - Constitutional AI System and Model Lock

### X.1 Definitions

1. Constitutional AI System (CAIS): The set of AI agents authorized to propose, implement, audit, and govern changes to GhostChain protocol, clients, smart contracts, infrastructure, and operational policies.
2. Primary Model: The top-tier reasoning model mandated for architecture, security, governance, and cross-domain protocol reasoning.
3. Execution Model: The model posture/instance authorized to produce code changes under strict guardrails.
4. Signed Output: Any artifact produced by CAIS that is cryptographically signed and reproducible from a referenced prompt, inputs, and commit hash.

### X.2 Model Lock

1. Primary Model Lock: The CAIS MUST use GPT-5.2 Thinking as the Primary Model for:
   - protocol architecture and consensus design
   - cross-layer (L1/L2/L3) alignment
   - threat modeling, invariants, and formal constraints
   - governance proposal drafting and risk assessment
2. Execution Model Lock: The CAIS MUST use GPT-5.2 in Codex-style execution posture as the Execution Model for:
   - contract and service implementation
   - DevOps automation and containerization
   - repository diffs and migrations
   - CI/CD, deployment scripts, and operational runbooks
3. Permitted Auxiliary Models: Lower-tier models may be used only for non-critical UX copy, mock UI scaffolding, and documentation formatting, but never for:
   - consensus, bridging, key management, treasury, governance, compliance, security controls, or chain parameters

### X.3 Upgrade / Downgrade Restrictions

1. The Primary Model and Execution Model MAY NOT be changed by any off-chain actor.
2. A model change MUST occur only via a Constitutional Proposal that:
   - specifies exact model identifiers and configuration
   - includes a compatibility impact report and security delta
   - provides reproducible benchmarks against the prior model (same tasks, same datasets)
   - passes the Supermajority + Timelock thresholds defined in the governance article(s)
3. Emergency freeze: If an exploit or regression is suspected, the Governor Agent (defined below) may trigger an AI output freeze that disables autonomous merging and forces human multi-sig review until lifted by vote.

### X.4 Output Gating Requirements (Non-Negotiable)

1. Diff-only mode: The Execution Model must output changes as patch/diffs, never destructive rewrites, unless a proposal explicitly authorizes a rewrite.
2. No chain resets: No automated action may reset chain state, keys, genesis, or validator identities unless a constitutional proposal explicitly authorizes a migration.
3. Reproducibility: Every AI-produced change must include:
   - prompt hash
   - input references (commit hash, config versions)
   - build + test commands
   - deterministic artifacts (where possible)
4. Two-person rule in AI form: No change may be enacted unless:
   - Architect proposes,
   - Executor implements,
   - Auditor verifies,
   - Governor authorizes (with on-chain vote or approved emergency procedure).

### X.5 Liability and Accountability

1. The system shall maintain an Evidence Ledger: signed attestations of prompts, diffs, audits, and governance decisions.
2. Any deviation from this Article constitutes a Constitutional Violation, automatically triggering:
   - incident report creation
   - governance review
   - rollback plan activation (when available and authorized)

### X.6 Multi-Agent Federation (Architect / Executor / Auditor / Governor)

This federation design enforces separation of powers: no single agent may design, implement, audit, and authorize the same change.

#### X.6.1 Agent Roles

Architect Agent (Policy + Design Authority):
- Mission: Convert goals into formal architecture, constraints, invariants, and phased plans.
- Outputs: architecture spec, threat model, invariants, acceptance criteria, diff-only plan.
- Limits: cannot commit code; cannot approve deployment; cannot bypass Auditor.

Executor Agent (Implementation Authority):
- Mission: Implement the Architect's plan as code, infra, and configs.
- Outputs: diff-only implementation, deterministic build/test commands, migrations (when authorized).
- Limits: cannot change scope/design; cannot approve its own work; must pass preflight gates.

Auditor Agent (Verification Authority):
- Mission: Assume the Executor is wrong; verify security, correctness, and compliance.
- Outputs: verification report, rerun test matrix, scan outputs, approval/rejection with reasons.
- Limits: cannot implement changes directly (except minimal fix diffs); cannot approve without evidence.

Governor Agent (On-Chain Authority):
- Mission: Convert approved changes into governance actions; enforce constitutional rules.
- Outputs: proposal payloads/calldata, timelock schedule, freeze/unfreeze actions, evidence ledger updates.
- Limits: cannot approve un-audited changes; cannot skip thresholds; cannot override the model lock without a constitutional proposal.

#### X.6.2 Workflow (State Machine)

Stage 0 - Intake: classify scope and risk.
Stage 1 - Architect: plan + invariants + acceptance criteria + file touch map.
Stage 2 - Executor: diff-only implementation + tests.
Stage 3 - Auditor: verification report + pass/fail + required fixes.
Stage 4 - Governor: on pass, produce governance payload and execution steps; on fail, return to Executor with required changes.
Stage 5 - Evidence Ledger: append prompt hash, commit hash, test results hash, and artifact hashes.

#### X.6.3 Mandatory Gates

1. Scope gate: Executor cannot touch files outside Architect's file touch map.
2. Security gate: Auditor must run a minimum verification matrix (unit tests, static analysis, dependency/vulnerability scans).
3. Governance gate: Governor must check model lock compliance, diff-only compliance, no-reset compliance, and timelock thresholds.

#### X.6.4 Kill Switches

1. AI output freeze: disables auto-merge and auto-propose.
2. Safe mode: restricts changes to docs and monitoring only.
3. Rollback mode: revert to last known good tagged release (when authorized).

#### X.6.5 Agent Communication Protocol (Message Contracts)

Each handoff must include the following fields for deterministic auditing:
- objective
- scope
- constraints
- files_allowed
- acceptance_tests
- risk_level
- rollback_plan
- evidence_required

#### X.6.6 On-Chain Policy Hooks (Minimum Enforceable Set)

Even with custom governance, on-chain enforcement should include:
- Proposal metadata standard: model id, evidence hash, risk classification.
- Execution guard: timelock executor checks required metadata and freeze state.
- Emergency freeze: execution blocked unless emergency override quorum or freeze lifted by vote.

