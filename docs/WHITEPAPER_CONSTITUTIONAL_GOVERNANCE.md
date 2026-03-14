# GhostChain Constitutional Governance — Full Stack Whitepaper (v2)

_Version: 2.0 | Date: 2026-03-10_

## Executive Summary

GhostChain is a sovereign Layer-1 blockchain (Cosmos SDK + CometBFT + EVM) that maintains canonical accounting, governance, and settlement for all protocol-controlled liquidity operations and AI-autonomous systems. This document describes the constitutional rules, governance model, AI authority model, and operational constraints that enforce safety, transparency, and accountability across the L1/L2/L3 stack.

## Chain Topology

```
GhostChain L1  (chain_id=14000101, :18545)  ← sovereign, canonical
  └── GhostL2  (chain_id=901, :29545)       ← OP Stack settlement to L1
        └── GhostL3 (chain_id=903, :39545)  ← OP Stack settlement to L2
```

**Routing law:** L3 → L2 → L1 only. No L3→L1 direct calls. No L2→external chains.

## Definitions

- **GhostChain L1**: canonical ledger of balances, governance, and settlement.
- **GST**: native gas token used across all layers — never ETH or any external token.
- **GhostBrain**: AI analytics and proposal layer — never has on-chain execution authority.
- **Signing Relay** (`:7910`): the only path for AI to submit governance proposals for human review.
- **External execution venue**: a chain used solely for yield generation; all proceeds must return to L1.
- **Adapter**: a bounded, governance-approved route to an external venue.

## Constitutional Commitments

1. **Canonical Settlement**: All realized yield and protocol rewards settle to GhostChain L1. External venues cannot mint or claim native GhostChain assets.
2. **Governance Authorization**: External deployment, caps, and strategy changes require on-chain governance approval under timelock.
3. **Exposure Limits**: Global and per-adapter deployment caps are enforced on-chain by `LoadBalancerVault`.
4. **Mandatory Settlement Windows**: Failure to settle within defined windows blocks further deployment and may trigger circuit-breaker and operator slashing.
5. **Transparent Accounting**: All settlement events include verifiable receipt hashes and monotonically increasing proof sequence numbers.
6. **AI Boundaries**: AI may propose, analyze, and advise — never execute autonomously on-chain. All CRITICAL AI actions route to the signing relay with `requires_human_review: true`.
7. **Constitutional Amendments**: Constitutional parameters may only be changed via `GhostConstitution` amendment procedures (supermajority, timelock, ZK verifier integration).

## AI Governance Authority Model

### What AI May Do
- Draft governance proposals and evidence bundles.
- Simulate and forecast protocol outcomes (GhostBrain predictive AI).
- Monitor validator health, gas prices, treasury drawdown, bridge anomalies.
- Generate advisory rebalance/upgrade proposals for human ratification.
- Operate the GAIS VM supervisor (auto-restart within `VM_ALLOWLIST`, cooldown-guarded).

### What AI Must Never Do
- Submit on-chain transactions without human governance ratification.
- Modify validator quorum, token supply logic, or bridge validator quorum.
- Bypass `routing-guard` routing constraints.
- Execute strategy changes beyond `PolicyGuard`-approved task scope.
- Autonomously modify consensus parameters.

### AI Safety Invariants
- `PolicyGuard.evaluate()` gates every task: DENY and REQUIRE_HUMAN_APPROVAL tasks are never dispatched.
- `TaskScheduler` circuit-breaker pauses orchestration on repeated DENY responses.
- GAIS circuit-breaker: max 4 VM restarts per hour per node.
- All SECURITY/CRITICAL governance events → signing relay (`:7910`) → human ratification queue.

## Governance Controls and Enforcement

### On-chain
- **`GhostChainGovernor`** — custom governor contract; quorum, supermajority, timelock.
- **`GhostConstitution`** — immutable + amendable on-chain law; ZK verifier for constitutional proofs.
- **`ProposalManager`** — entry-point for GST-deposited proposals (spam-prevention via `MIN_DEPOSIT`).
- **`VoteSystem`** — GST-weighted voting with delegation and on-chain finalisation.
- **`AdapterRegistry`** — governance list of approved external venues.
- **`SettlementOracle`** — verifies ECDSA/ZK settlement proofs; blocks further deployment if overdue.
- **`CircuitBreaker`** — emergency pausing by guardian and governance.
- **`RewardRouter`** — deterministic yield reinjection splits (timelocked changes).

### Off-chain AI
- `governance_agent.ts` (AI Orchestrator): polls EVM + Cosmos proposals, detects bypass attempts, alerts on low participation.
- `governance-event-bridge/`: bridges L1/L2 governance events to GhostBrain signals.
- `hyper-ghost-governor/`: advanced proposal routing with cross-layer fan-out.

## Treasury Constitution

GhostChain's Fully Autonomous Treasury (FAT) system:

```
TreasuryRatificationProposal → GhostChainGovernor → ProposalExecutor
  → TreasuryController → TreasuryVault
```

No EOAs possess unilateral treasury execution authority. All mutations traverse the full governance path. AI may forecast, simulate, and draft proposals — never execute or override.

**Formal Invariants:**
- Reserve floors, budget ceilings, governance path, and treaty caps enforced on-chain.
- `PolicyViolationGuard`: halts execution on ambiguity or freeze. Emergency path is freeze-only.

## Federation and Interoperability

GhostChain can federate with sovereign treasuries via treaty contracts. Treaties define cross-protocol settlement obligations and rate limits. Federation proposals follow the same governance quorum requirements.

## Routing Law (Hard Constraint)

Encoded in `packages/routing-guard/` and `packages/routing-law/`:
1. L3 → L2 → L1 only (never L3→L1 direct).
2. L2 → L1 only (never L2→external chains).
3. L1 is the only layer that may communicate externally.

Any violation is detected by `governance_agent.ts` and escalated as CRITICAL to the signing relay.

## Risk Management

GhostChain’s governance and enforcement model is designed around:

- **Containment** (caps, pauses, timelocks),
- **Accountability** (audit logs, receipt hashes, proof sequences),
- **Recoverability** (unwind pathways, emergency procedures),
- **Non-circumvention** (on-chain gating, role separation).

## Auditability and Evidence

All deployments, settlement events, configuration changes, and governance actions are recorded on-chain. Off-chain automation produces append-only logs keyed to on-chain policy hashes and transaction IDs, enabling independent reconstruction and verification.

## Amendment Procedure

Constitutional amendments require:

- higher quorum,
- a supermajority threshold,
- and a longer timelock delay,
  as defined in the ConstitutionRegistry. These rules can ratchet tighter but cannot be weakened below immutable minimum thresholds.

