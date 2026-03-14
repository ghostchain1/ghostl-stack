# Governance non-bypassability (code-level proof guide)

This document maps the **“AI cannot override governance”** and **“no interchain bypass”** requirements to concrete on-chain gates, off-chain policy wiring expectations, and the test/invariant evidence in this repository.

Scope: code-level enforcement (contracts + tests). Runtime/network enforcement requires running the full-host gates without skips (see `ops/runbooks/full-host-go-no-go.md`).

## Threat model (what “bypass” means here)

Bypass attempts include:

- An AI component calling privileged setters directly (without a proposal/executor path).
- An AI component invoking “emergency”/“bypass” paths without being governance.
- An interchain router/bridge sending egress without being authorized or within caps.

## Root governance gate: `Governed`

Many high-impact components inherit `contracts/src/common/Governed.sol` and gate privileged operations behind:

- `onlyGovernance` / `onlyExecutor`: `msg.sender` must be the configured `governor` or `timelock`.

This is the core “no bypass” primitive: any bypass must either compromise the executor/timelock or pass through them.

## Policy gates (on-chain)

### Constitutional policy registry: `PolicyRegistry`

`contracts/src/governance/PolicyRegistry.sol` is `Governed` and only governance can:

- create/modify policy settings (`setPolicySetting`)
- queue/activate policy changes (`queuePolicy`, `activatePolicy`, `applyPolicy`)
- set/clear emergency policy windows (`setEmergencyPolicy`, `clearEmergencyPolicy`)
- roll back within the declared rollback window (`rollbackPolicy`)

Policy changes are therefore proposal/executor mediated.

### Interchain egress authorization + caps: `InterchainAuthorization`

`contracts/src/governance/InterchainAuthorization.sol` is `Governed` and only governance can:

- enable/disable/pause global egress (`setEnabled`, `setPaused`)
- allow/pause per-chain, per-adapter, per-asset (`setChainAllowed`, `setAdapterAllowed`, `setAssetAllowed`, plus pause variants)
- set caps (`setCapConfig`)
- assign operators (`setOperator`)

On-chain enforcement entrypoint:

- `consumeEgress(...)` reverts unless the caller is `operators[caller]==true` **or** governance, and reverts if caps/allowlists fail.

Off-chain routers can also use:

- `checkEgress(...)` to preflight a route decision and produce a structured denial reason.

## AI execution is policy- and governance-caged

### AI action gating: `AICommandCenter`

`contracts/src/ai/AICommandCenter.sol` is the on-chain “AI decision execution” choke point.

Key properties:

- Configuration that binds the system to governance policy is restricted:
  - `setPolicyRegistry(...)` is gated by `onlyGovernanceOrBootstrap` (i.e., cannot be changed by arbitrary callers once bootstrap ends).
- Each decision execution enforces policy gates before dispatch:
  - `_enforcePolicyRegistry(target, selector)` can require `policyRegistry.isActionAllowed(role, actionId)` and optionally records.

Operationally, this means the AI can only execute what governance has enabled and what the registry allows for the AI role.

## “Bypass” paths exist, but are governance-only

Some modules include “bypass”/“emergency” functions intended for governance use (e.g., to respond to incidents).

The required property is: **these functions are not callable by AI or non-governance actors**.

Proof points:

- `contracts/test/foundry/AIAttestationHubPolicyGuard.t.sol`:
  - `testGovernanceBypassRestricted()` asserts `PolicyGuard.governanceBypass(...)` reverts with `NOT_EXECUTOR` for non-governance callers.
- `contracts/test/foundry/SlashingManagerPolicyGuard.t.sol`:
  - `testGovernanceBypassAlwaysSucceeds()` demonstrates a bypass path that is callable by `governor` and works as intended; this is not an AI bypass, it is an explicit governance escape hatch.

## Low Balancer governance (proposal/quorum enforcement)

`contracts/src/governance/LowBalancerGovernor.sol` provides quorum-enforced proposals executed via `contracts/src/governance/ProposalExecutor.sol`:

- proposals require vote participation above `quorumBps` (when non-zero)
- execution is mediated by the executor queue and delay

This ensures Low Balancer parameter changes follow the governance path and cannot be “fast patched” by AI components.

## Invariants and declared constraints

The invariant suite is part of the Phase 6 gates (`npm --prefix contracts run test:invariant`) and is declared in:

- `docs/ai-core/invariants.md`
- `docs/security/ai-governance-invariants.yaml`

These invariants are meant to mechanically detect regressions that would allow:

- unauthorized governance bypass
- policy-gate disablement without governance
- unsafe interchain execution patterns

## What this does *not* prove by itself

This guide is a **code-level proof map**; it does not prove:

- correct runtime deployment wiring (addresses, operator sets, policy registry configuration)
- liveness/availability properties of RPC endpoints and monitoring
- external bridge safety against real adversarial environments

Run `ops/runbooks/full-host-go-no-go.sh` on a real host to validate runtime wiring without skips.

