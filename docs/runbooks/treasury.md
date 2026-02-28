# Treasury Runbook (GhostStack Econ Engine)

## Scope
- L1 treasury governance execution
- L3→L2→L1 routing law compliance
- Allocation, yield return, and distribution operations

## Standard flow
1. Proposal drafted and approved on governance path.
2. `MainnetActivationGate` must be enabled for mainnet execution mode.
3. `hg-treasury-agent` receives execution intent and validates:
   - approval flag
   - off-chain risk cap
   - mainnet activation gate status
4. Receipt is signed and persisted to evidence directory.
5. Indexer ingests execution metadata.

## Emergency controls
- Contract pause:
  - `L3FeeRouter.setPaused(true)`
  - `L2FeeRouter.setPaused(true)`
  - `L1TreasuryReceiver.setPaused(true)`
  - `TreasuryVault.setPaused(true)`
- Risk hard stop:
  - `RiskPolicyRegistry.setGlobalPolicy(..., emergencyPause=true)`

## Verification checklist
- Routing law tests pass.
- Governance gate test passes.
- Snapshotter produces merkle root receipts.
- Alert panel reports all `hg-*` targets as healthy.
