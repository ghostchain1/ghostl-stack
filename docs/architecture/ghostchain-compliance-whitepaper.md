# GhostChain: A Non-Custodial, Autonomous, Compliance-Aware Blockchain Protocol

## 1) Executive Summary
GhostChain is a non-custodial, compliance-aware blockchain ecosystem spanning GhostChain (L1), GhostL2, and GhostL3. The system enforces policy through protocol logic and gateway controls, while maintaining privacy and transparency. Compliance decisions are explainable, auditable, and reversible by design.

## 2) System Architecture
The Protocol Intelligence Layer (PIL) ingests chain telemetry, legal signals, and policy packs. It produces advisory and enforcement decisions for gateways and applications. On-chain guardrails are limited to privileged subsystems (bridges, treasury, governance) and do not interfere with general execution.

## 3) Non-Custodial Design
The system never takes custody of user assets or private keys. All enforcement is applied at RPC preflight and protocol guard layers, with no key handling or escrow.

## 4) Privacy & ZK Compliance
Compliance proofs are represented as hashes and attestations. The system is designed to accept zero-knowledge proofs that confirm eligibility without disclosing identity or personal data. Proof data is stored off-chain, and on-chain references use hashes only.

## 5) Jurisdictional Enforcement Model
Compliance is jurisdiction-aware. Multiple jurisdiction signals may apply to a single transaction. The system resolves conflicts deterministically, defaulting to advisory warnings unless a high-risk rule explicitly blocks.

## 6) AML / Sanctions Approach
The PIL ingests sanctions and AML signals via pluggable adapters. Policies are generated and simulated before activation. All decisions include a correlationId and evidence chain for auditability.

## 7) Validator Governance & Economics
Validators are never penalized for user behavior. Compliance scores are based on enforcement correctness, policy participation, and emergency response adherence. Incentives use reward multipliers and soft slashing, governed by on-chain thresholds.

## 8) Auditability & Transparency
Every decision and policy activation is logged with inputs, outcomes, and versioned policy references. Rollback procedures are built into the control plane to reverse policy activation if regressions are detected.

## 9) Governance & Non-Bypassable Controls

GhostChain’s compliance and interchain controls are **governance-locked** and designed to be **non-bypassable**:

- **On-chain authority:** policy registries and interchain allowlists/caps are owned by a timelocked executor and can be changed only via quorum-governed proposals.
- **No AI override:** AI services can propose risk assessments and policy updates, but execution requires on-chain ratification and quorum.
- **Emergency controls with due process:** emergency actions are time-bounded (expiry) and reversible; full-state changes still require governance proposals.

This model ensures enforcement is consistent, attributable, and resistant to unilateral operator or AI action.

## 10) Security & Assurance

GhostChain uses layered assurance:

- **Formal invariants:** core invariants (e.g., treasury reserve/budget and governance-only execution paths) are specified and fuzzed/invariant-tested.
- **Static analysis:** smart contracts are analyzed with SAST tooling; findings are triaged under a “no critical vulnerabilities” gate.
- **Secret and misconfiguration scanning:** repository and deployment manifests are scanned for secrets and high/critical misconfigurations.

Reproducibility is supported through deterministic runbooks, evidence packs, and artifact hashing (see `docs/evidence/README.md` and `docs/architecture/phase5-security.md`).

## 11) Limitations & Legal Disclaimers
This document is technical in nature and does not constitute legal advice. Compliance outcomes depend on the accuracy of policy inputs, signal quality, and operator configuration. Jurisdictional requirements may change, requiring continuous updates and governance oversight.
