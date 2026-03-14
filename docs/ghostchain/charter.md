# GhostChain Constitutional Charter

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
