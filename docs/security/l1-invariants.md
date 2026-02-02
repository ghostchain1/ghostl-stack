# L1 Formal Invariants (GhostChain)

This document enumerates the core L1 invariants and where they are enforced. The intent is to make L1 safety properties explicit, machine-checkable, and reviewable for governance.

## Scope

- L1 contracts only (no L2/L3 behavior changes).
- Enforcement uses Foundry tests, Echidna harnesses, and Scribble annotations already present in core contracts.

## Invariants

### 1) Governance Action Authorization
**Invariant:** Only governance/owner paths may mutate protocol configuration or execute privileged operations.

**Enforced by:**
- `contracts/src/common/Ownable.sol` + `contracts/src/common/Governed.sol` modifiers.
- Foundry: `contracts/test/foundry/L1Invariants.t.sol` (config + rollup manager ownership).
- Foundry: `contracts/test/foundry/FuzzGovernance.t.sol` (governor/executor access).
- Foundry: `contracts/test/foundry/GasTokenInvariant.t.sol` (fee policy + slashing controls).

### 2) Token Supply / Burn Safety
**Invariant:** Total supply only changes via authorized mint/burn paths; transfers do not alter total supply.

**Enforced by:**
- Scribble: `contracts/src/l1/NativeToken.sol` (`#if_succeeds` assertions).
- Foundry: `contracts/test/foundry/FuzzNativeToken.t.sol`.
- Echidna: `contracts/formal/echidna/TokenEchidna.sol`.

### 3) Validator Set Changes
**Invariant:** Validator membership changes are owner-only and reject zero-address additions.

**Enforced by:**
- Foundry: `contracts/test/foundry/L1Invariants.t.sol` (add/remove guard + zero address check).

### 4) Bridge-Facing L1 Invariants
**Invariant:** L1 bridge components enforce proposer/owner gating and monotonic output updates.

**Enforced by:**
- Foundry: `contracts/test/foundry/L1Invariants.t.sol` (L2OutputOracle proposer gating + monotonic block numbers, Messenger relay authorization, RollupManager ownership).
- Foundry: `contracts/test/foundry/InvariantBridge.t.sol` (relayer non-zero).

### 5) Emergency Mode Invariants
**Invariant:** Emergency toggles are owner-only and are reversible with clear state.

**Enforced by:**
- Foundry: `contracts/test/foundry/L1Invariants.t.sol` (EmergencyShutdown + PauseGuardian guards).

## Running the checks

```bash
cd contracts
npm run test:foundry
npm run test:invariant
npm run formal:scribble
npm run formal:echidna
```

## Evidence

- Evidence pack generation for L1 invariants and config snapshots is handled by `infra/scripts/evidence-pack-l1.sh`.
