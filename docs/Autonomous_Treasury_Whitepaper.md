# GhostChain Autonomous Treasury Whitepaper

## 1. System Overview

GhostChain’s Fully Autonomous Treasury (FAT) system governs protocol funds across L1/L2/L3 using on-chain ratification, timelock execution, and policy-locked spending. Treasury actions are initiated by proposals, ratified through governance, and executed by the TreasuryController against a non-custodial TreasuryVault.

## 2. Governance Controls

- **Governor**: token-based voting contract for ratifying proposals.
- **ProposalExecutor**: timelock executor for ratified proposals.
- **TreasuryController**: sole execution entrypoint for all treasury mutations.
- **TreasuryVault**: custody of assets; callable only by TreasuryController.

No EOAs possess unilateral execution authority. All treasury mutations traverse the path:

```
TreasuryRatificationProposal -> Governor -> ProposalExecutor -> TreasuryController -> TreasuryVault
```

## 3. AI Role Limitations

The Treasury AI engine provides deterministic analytics and proposal drafts. AI may:

- Forecast revenue and runway
- Simulate stress scenarios
- Suggest allocation/rebalance strategies
- Produce explainability and compliance attestations

AI may NOT execute or override governance or policy.

## 4. Risk Management Framework

- **Policy-Locked Spending**: minimum reserves and epoch budgets are enforced on-chain.
- **Fail-Closed Guard**: PolicyViolationGuard halts execution on ambiguity or freeze.
- **Evidence Receipts**: every action emits a structured receipt for auditing.
- **ZK Proof Hooks**: optional proof roots can be enforced in the guard.

## 5. Formal Invariants

The system enforces formal invariants for reserve floors, budget ceilings, governance path, and treaty caps. See:

- `docs/treasury/Treasury_Invariants_Math.md`
- `contracts/src/treasury/TreasuryInvariants.sol`

## 6. Emergency Procedures

- Emergency path is **freeze-only**.
- When `PolicyViolationGuard.emergencyFreeze = true`, all treasury actions are blocked.
- No emergency withdrawals are permitted.

## 7. Auditability and Replayability

- `TreasuryReceipts` emits receipts with policy hash/version, action hash, and metadata.
- `EvidenceBundle` and `treasury-evidence` service produce court-ready evidence packs.
- Merkle roots and signatures allow third-party replay and verification.

## 8. Federation Model

GhostChain can federate with sovereign treasuries via treaty contracts. Treaties define:

- Caps, purpose, time bounds
- Exit/unwind procedures
- Dispute and evidence expectations

Federation actions are policy-checked and governance-ratified. See `docs/treasury/Federation_Model.md`.

## 9. Compliance and Security

- Slither and Echidna are integrated for static and property testing.
- Foundry invariant tests enforce budget and reserve invariants.
- Optional ZK verification can be bound to policy compliance roots.

## 10. Conclusion

The FAT system provides autonomous yet governed treasury operations with strong guarantees: no unilateral control, enforceable spending policy, court-ready evidence, and sovereign federation safety.

