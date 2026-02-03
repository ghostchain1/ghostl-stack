# GhostChain AI Governance Invariants

This document formalizes the AI governance invariants in mathematical form and maps them to
on-chain enforcement points and tests.

## Invariant Registry

Refer to `docs/security/ai-governance-invariants.yaml` and `docs/ai-core/invariant-registry.json` for
machine-readable mappings.

## Formal Invariants (Math)

### AI-INV-001 — Constitution hash is immutable across primitives

```
∀ c ∈ {PolicyRegistry, EvidenceVault, AIProposalExecutor, AIConstitutionalProposal}:
  constitutionHash(c) = H
```

### AI-INV-002 — AI cannot influence fork choice, block ordering, or finality

```
∀ action ∈ {fork_choice, block_ordering, finality}:
  forbidden(action) = true
```

### AI-INV-003 — Evidence must be authorized and non-zero

```
∀ r:
  (kind(r) = 0 ∨ evidenceHash(r) = 0) ⇒ reject
  submitter(r) ∉ {governor, timelock, approved_submitter} ⇒ reject
```

### AI-INV-004 — Policy updates respect bounds and enabled flags

```
∀ key,value:
  enabled(key) = false ⇒ reject
  hasBounds(key) ⇒ min(key) ≤ value ≤ max(key)
```

### AI-INV-005 — Policy updates require evidence hash

```
∀ update:
  evidenceHash(update) = 0 ⇒ reject
```

### AI-INV-006 — Activation delay is enforced

```
∀ key:
  activate(key) only if now ≥ activatesAt(key)
```

### AI-INV-007 — Emergency policy expiry

```
∀ key:
  emergency_active(key) ⇒ now ≤ expiresAt(key)
```

### AI-INV-008 — Rollback allowed only within rollback window

```
∀ key:
  rollback(key) ⇒ now ≤ lastActivatedAt(key) + rollbackWindow(key)
```

### AI-INV-011 — Policy updates must be recent

```
∀ update:
  now − issuedAt(update) ≤ maxUpdateAge
```

### AI-INV-012 — Quorum required for non-governance policy updates

```
∀ update (caller ∉ {governor, timelock}):
  approvals(update) ≥ minApprovals
```

### AI-INV-013 — Governance bypass requires governance authority

```
governanceBypass(subject, action) only if caller ∈ {governor, timelock}
```

### AI-INV-014 — Emergency scope requires enabled emergency window

```
emergencyExpiry(key) = 0 ⇒ reject emergency policy update
```

### AI-INV-015 — Federated proposals require upstream checkpoint hash

```
CHAIN_POLICY_REQUIRED = 1 ⇒ checkpointHash provided
```

## Enforcement Map (Solidity + Tests)

- `contracts/src/governance/PolicyRegistry.sol`
- `contracts/src/governance/EvidenceVault.sol`
- `contracts/src/governance/AIProposalExecutor.sol`
- `contracts/src/governance/AIConstitutionalProposal.sol`

Tests:
- `contracts/test/invariants/AIConstitution.invariant.t.sol`
