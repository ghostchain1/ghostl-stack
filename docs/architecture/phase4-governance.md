# Phase 4 — Governance & On-chain Control (Quorum + Interchain Authz)

Phase 4 delivers the **on-chain primitives** that make Low Balancer interchain access **governance-controlled** and **non-bypassable**:

- A quorum-enforcing governor that drives a timelocked `ProposalExecutor`.
- A governed `InterchainAuthorization` registry for allowlists, caps, and emergency halts.

> Core rule: **AI and operators can propose/attest/recommend, but only governance can grant or change permissions.**

## Contracts added (this repo)

### `LowBalancerGovernor`

File: `contracts/src/governance/LowBalancerGovernor.sol`

Purpose:
- Token voting **with quorum enforcement**.
- Timelocked execution through `contracts/src/governance/ProposalExecutor.sol`.
- Uses **staking (token escrow)** during voting to prevent voting-power re-use via transfers.

Key behaviors:
- `stake(amount)` / `withdraw(amount)`: governance token escrow with per-voter `lockUntil`.
- `propose(target, value, data)`: creates a proposal and snapshots token `totalSupply()` for quorum math.
- `vote(id, support)`: weight is the caller’s **staked** balance; voting sets/extends `lockUntil`.
- `queue(id)`: requires:
  - voting ended
  - `forVotes > againstVotes`
  - `quorumBps` satisfied (participation vs `supplySnapshot`)
  - then queues the action on `ProposalExecutor`
- `execute(id)`: executes the queued tx via `ProposalExecutor` (timelock + constitutional checks).

Governance non-override:
- Governor parameter setters (`setVotingPeriod`, `setQuorumBps`) are callable **only by** `ProposalExecutor` (i.e., via a successful proposal).

### `InterchainAuthorization`

File: `contracts/src/governance/InterchainAuthorization.sol`

Purpose:
- Governance-locked allowlists and caps for interchain egress:
  - allowed destination chains
  - allowed bridge adapters
  - allowed assets
  - emergency pause switches
  - per-tx and per-window (24h) caps (with optional fallback keys)

Key behaviors:
- All configuration is `onlyGovernance` (must be invoked by `ProposalExecutor`):
  - `setEnabled`, `setPaused`
  - `setChainAllowed`, `setChainPaused`
  - `setAdapterAllowed`, `setAdapterPaused`
  - `setAssetAllowed`, `setAssetPaused`
  - `setCapConfig(dstChainId, asset, perTxCap, perWindowCap, enabled)`
  - `setOperator(operator, allowed)`
- `checkEgress(...)` is a view-only decision API for off-chain routers.
- `consumeEgress(...)` is a stateful API that (later) an on-chain router can call to **atomically** enforce window caps.

## Wiring (expected deployment/ownership)

The intended authority chain is:

1. Deploy `ProposalExecutor(delaySeconds)` (timelock).
2. Configure `ProposalExecutor` guards/evidence (e.g., `ConstitutionalGuard`, `EvidenceBundle`).
3. Deploy `LowBalancerGovernor(votingToken, executor, votingPeriod, quorumBps)`:
   - constructor sets itself as the executor’s governor.
4. Deploy governed registries (L1 root), setting `governor_` to the **executor address**:
   - `PolicyRegistry(executor, ...)`
   - `InterchainAuthorization(executor, ..., enabled_)`
   - (and similarly: `AgentGovernancePolicy`, `AIOracleRegistry`, `PolicyGuard`, etc.)

Result:
- Any change to allowlists/caps/halts requires a **proposal + quorum + timelock execution**.

## Tests

Foundry coverage:
- `contracts/test/foundry/LowBalancerGovernor.t.sol`
- `contracts/test/foundry/InterchainAuthorization.t.sol`

