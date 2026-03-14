# Ghost L2 Invariants

## Governance authorization
- Governance-only actions on L1/L2 policy registry must be restricted to `governor`/`timelock`.
- AI actions must be ratified by L1 policy (`AgentGovernancePolicy.canExecute`).

## Gas token
- L2 must use the canonical GST token address for gas (no per-layer token deployments).
- Any attempt to deploy per-layer gas tokens must revert.

## Bridge-facing invariants
- L2 output publishing must be monotonic.
- Bridge router and messenger addresses must remain consistent with L1 deployments.

## Validator/actor controls
- Batcher/proposer keys must be governed and rotated through policy.
- Unauthorized updates to batcher/proposer roles must revert.

## Emergency mode
- Emergency pause/kill switches must be gated by governance and recorded in evidence.
