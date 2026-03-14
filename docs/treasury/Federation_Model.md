# Inter-Chain Sovereign Treasury Federation Model

## 1. Objectives

- Establish treaty-based, on-chain constraints for cross-chain treasury collaboration.
- Preserve sovereignty: no partner can unilaterally drain shared funds.
- Standardize evidence, policy hashes, and receipts across chains.

## 2. Components

- **FederationRegistry**: records partner treasuries + policy hashes.
- **TreasuryTreaty**: codifies cap, time bounds, purpose hash, and exit delay.
- **FederationRouter**: enforces treaty constraints before a federated draw is recorded.

## 3. Governance Model

- All federation actions are proposal-ratified and timelocked.
- Treaty creation, activation, exit requests, and finalization are executed through `TreasuryController`.
- Partner registration requires a policy hash and treasury contract address.

## 4. Security Model

- Treaty draws are capped by `cap` and blocked once `exit_requested` is true.
- Draws are recorded only after the treasury action succeeds (atomicity ensured by transaction revert on failure).
- Controllers, routers, and registries must be contract addresses (no EOAs).

## 5. Dispute Handling

- Treaties include a purpose hash and time bounds to allow external arbitration.
- Evidence packs provide replayable traces of authorization, policy, and execution.
- Partners can invoke exit requests if disputes arise.

## 6. Exit / Unwind Clauses

- **Request Exit**: sets `exit_requested` and starts the exit delay.
- **Finalize Exit**: after delay, marks treaty inactive and prevents further draws.
- Exit actions are themselves governance-ratified and recorded in receipts.

## 7. Federation Action Constraints

Every federated draw MUST satisfy:

- Proposal ratification and timelock execution
- Policy checks (reserve + budget)
- Treaty caps and active status
- Receipt emission for evidence packs

## 8. Threat Scenarios

- **Partner compromise**: capped by treaty limit + exit request.
- **Cross-chain spoofing**: only registry-listed treaty contracts are valid.
- **Policy drift**: registry stores partner policy hash for audit.

