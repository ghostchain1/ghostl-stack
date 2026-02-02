# GhostChain Treasury Constitution

## 1. Constitutional Constraints

- All treasury mutations must be proposal-ratified, timelocked, and executed via `TreasuryController`.
- Emergency powers are freeze-only. No emergency withdrawals.
- Policy ambiguity fails closed: no execution without explicit policy compliance.
- No EOAs hold unilateral treasury authority.

## 2. Canonical Execution Path

```
TreasuryRatificationProposal -> Governor -> ProposalExecutor -> TreasuryController -> TreasuryVault
```

## 3. Control Flow (Mermaid)

```mermaid
flowchart TD
  A[TreasuryRatificationProposal] --> B[Governor]
  B --> C[ProposalExecutor / Timelock]
  C --> D[TreasuryController]
  D --> E[TreasuryVault]
  D --> F[TreasuryReceipts]
  D --> G[PolicyViolationGuard]
  G --> H[TreasuryPolicy]
```

## 4. Cross-Chain Constraints (Mermaid)

```mermaid
sequenceDiagram
  participant Gov as Governor
  participant Exec as ProposalExecutor
  participant Ctrl as TreasuryController
  participant Router as TreasuryRouter
  participant Remote as Remote Router

  Gov->>Exec: ratify + timelock
  Exec->>Ctrl: execute(action)
  Ctrl->>Router: route(action)
  Router-->>Remote: xDomain message
  Remote-->>Remote: record route (no auto-exec)
```

## 5. Rebalancing Loop (Mermaid)

```mermaid
flowchart LR
  AI[AI Treasury Engine] -->|proposal calldata| Gov
  Gov --> Exec
  Exec --> Ctrl
  Ctrl --> Guard
  Guard --> Policy
  Ctrl --> Vault
  Vault --> Receipts
```

## 6. Federation Treaty Flow (Mermaid)

```mermaid
sequenceDiagram
  participant Gov as Governor
  participant Exec as ProposalExecutor
  participant Ctrl as TreasuryController
  participant Fed as FederationRouter
  participant Treaty as TreasuryTreaty

  Gov->>Exec: ratify treaty action
  Exec->>Ctrl: execute(FEDERATION)
  Ctrl->>Fed: recordDraw(treatyId)
  Fed->>Treaty: recordDraw
```

## 7. Rollback / Freeze Procedures

- If any invariant fails or policy mismatch occurs, set `PolicyViolationGuard.emergencyFreeze = true`.
- Freeze does not permit withdrawals; it only blocks further actions.
- To resume, governance must ratify a policy-corrective proposal.

