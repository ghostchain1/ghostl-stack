# Treasury Invariants (Math Specification)

## 1. Definitions

Let:

- `V_t` = total treasury vault balance at time `t` for the relevant asset.
- `R_min` = minimum reserve (policy parameter).
- `B_epoch` = epoch spend budget (policy parameter).
- `S_epoch(t)` = cumulative spend in the current epoch at time `t`.
- `E_len` = epoch length in seconds (policy parameter).
- `E_start(t)` = start timestamp of the current epoch.
- `A` = action executed by the TreasuryController.
- `amount(A)` = asset amount for the action.
- `value(A)` = native value for the action.
- `spend(A)` = `amount(A) + value(A)`.
- `chain_id` = current chain ID.
- `dest_chain(A)` = destination chain ID for cross-chain actions.
- `Gov` = ProposalExecutor (timelock executor) address.
- `Ctrl` = TreasuryController address.
- `Vault` = TreasuryVault address.
- `Policy` = TreasuryPolicy address.
- `Guard` = PolicyViolationGuard address.
- `Receipts` = TreasuryReceipts address.
- `Treaty` = TreasuryTreaty address (federation).
- `PolicyVersion_t` = policy version at time `t`.
- `PolicyHash_t` = keccak256 hash of the current policy parameters.

## 2. Invariants

### I1. Reserve Invariant

For any treasury action `A` executed at time `t`:

```
V_t - spend(A) >= R_min
```

Meaning: the vault must not fall below the minimum reserve after any spend.

### I2. Spend Ceiling Invariant (Epoch Budget)

For any action `A` executed at time `t` within the same epoch:

```
S_epoch(t) + spend(A) <= B_epoch
```

Meaning: cumulative spend in the epoch cannot exceed the policy budget.

### I3. Cross-Chain Escrow Invariant

For any action `A` with `dest_chain(A) != chain_id`:

```
A must be routed via TreasuryRouter
```

and the local vault balance is unchanged unless the action explicitly transfers to a bridge escrow:

```
if dest_chain(A) != chain_id and spend(A) > 0, then target(A) must be a bridge escrow.
```

### I4. No-EOA-Control Invariant

All controller/guard/policy/receipt executors MUST be contracts:

```
code_length(Ctrl) > 0
code_length(Policy) > 0
code_length(Guard) > 0
code_length(Receipts) > 0
```

and Vault only accepts calls from `Ctrl`.

### I5. No-Bypass Invariant (Ratification + Timelock)

Every treasury mutation MUST satisfy:

```
Governor -> ProposalExecutor -> TreasuryController -> TreasuryVault
```

Formally:

```
caller(Vault.transfer*) == Ctrl
caller(Ctrl.execute) in {Gov}
```

and ProposalExecutor enforces `delay > 0`.

### I6. No-Circular-Flow Invariant

Treasury actions MUST NOT route funds back to `Gov`, `Ctrl`, or `Vault`:

```
target(A) not in {Gov, Ctrl, Vault}
```

unless explicitly whitelisted for protocol-owned components.

### I7. Policy Monotonicity Invariant

Policy versions are strictly monotonic:

```
PolicyVersion_{t+1} >= PolicyVersion_t
```

and `PolicyHash_t` changes only when `PolicyVersion` increments.

### I8. Federation Treaty Cap Invariant

For any treaty draw `D` at time `t`:

```
TotalDrawn_{t} + D <= TreatyCap
```

and if `exit_requested == true`, draws are disallowed.

## 3. Threat Model Mapping

| Threat | Blocked By | Rationale |
|---|---|---|
| Treasury drained below minimum | I1 | Enforces reserve floor after every spend. |
| Budget exhaustion / runaway spending | I2 | Enforces epoch budget ceiling. |
| Cross-chain bypass | I3 + I5 | Cross-chain actions must go through router and governance. |
| EOA hotkey takeover | I4 + I5 | Enforces contract-only control and timelock path. |
| Re-entrancy / circular flow | I6 | Disallows treasury routing back to its controllers. |
| Silent policy downgrade | I7 | Version monotonicity + policy hash pinning. |
| Federation pool drain | I8 | Treaty cap and exit guard. |

## 4. Preconditions and Postconditions

### Action: TRANSFER

Preconditions:

- `actionType == TRANSFER`
- `Guard.enabled == true`
- `!Guard.emergencyFreeze`
- `spend(A) > 0`
- Invariants I1 and I2 hold

Postconditions:

- `V_t` reduced by `spend(A)`
- `S_epoch(t+1) = S_epoch(t) + spend(A)`
- Receipt recorded with `policyHash` and `policyVersion`

### Action: CALL

Preconditions:

- `actionType == CALL`
- Target not in `{Gov, Ctrl, Vault}` unless explicitly whitelisted
- Invariants I1 and I2 hold (if value/amount > 0)

Postconditions:

- External call completes successfully
- Receipt recorded

### Action: REBALANCE

Preconditions:

- `actionType == REBALANCE`
- `aiProposalHash != 0`
- `aiRiskScoreBps <= maxRiskScoreBps`
- Invariants I1 and I2 hold

Postconditions:

- Allocation change executed by policy-bounded call
- Receipt recorded with AI metadata

### Action: FEDERATION

Preconditions:

- `actionType == FEDERATION`
- Treaty is active and `TotalDrawn + amount <= cap`
- Invariants I1 and I2 hold

Postconditions:

- Treaty total drawn incremented
- Receipt recorded with `treatyId`

### Action: FEDERATION_EXIT

Preconditions:

- `actionType == FEDERATION_EXIT`
- Treaty exists and is active
- Caller is governance through TreasuryController

Postconditions:

- `exit_requested == true` OR `exit_finalized == true`
- Receipt recorded

## 5. Notes

- All invariants are enforced in Solidity by `TreasuryPolicy`, `PolicyViolationGuard`, and `TreasuryController` runtime assertions.
- The Foundry invariant tests fuzz budgets/reserves and fail on any invariant break.
