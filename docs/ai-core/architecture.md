# Ghost Chain AI Core Architecture

## Purpose
Ghost Chain AI Core is the intelligence layer for GhostChain (L1), GhostL2, and GhostL3. It observes chain state, predicts execution risk, makes policy-aware decisions, records actions, verifies outcomes, and learns from history.

## Runtime Topology
- **API service** (`services/ghost-gas-engine`) exposes AI Core endpoints and metrics.
- **Worker** (`services/ghost-gas-engine` worker) runs the decision loop and deployment retries.
- **Postgres** stores observations, predictions, decisions, actions, governance recommendations, and policy constraints.
- **Redis** queues deployment retries and decouples submission from API requests.

## Decision Loop
1. **Observe**: Sample latest block data, RPC latency, and namespace for each chain.
2. **Predict**: Generate risk forecasts using historical outcomes and congestion signals.
3. **Decide**: Apply policy constraints and autonomy mode to select actions.
4. **Act**: Record actions and, when tied to deployments, execute retries with updated gas limits.
5. **Verify**: Trace and classify transaction outcomes.
6. **Learn**: Record failure fingerprints and update policy drift metrics.
7. **Govern**: Emit governance recommendations when thresholds are exceeded.

## Data Model (Key Tables)
- `ai_chain_observations`: block + RPC health samples
- `ai_risk_predictions`: risk forecasts + recommended actions
- `ai_core_decisions`: policy-aware decisions
- `ai_core_actions`: recorded actions and interventions
- `ai_failure_fingerprints`: recurring failure signatures
- `ai_suppression_rules`: prevent repeat failures
- `ai_governance_recommendations`: governance advisories
- `ai_policy_constraints`: safety limits and allowed actions

## External Interfaces
- `/v1/ai-core/*` endpoints for UI and operators.
- `/metrics` for Prometheus.
- `/v1/autonomy/*` for gas-policy autonomy controls.

## Safety Principles
- Decisions are bounded by policy constraints.
- Modes control autonomy level: observe-only → advisory → assisted → autonomous.
- Every action is logged and traceable to an AI core decision.

## Governance-Locked Autonomy (L1)
Autonomous actions are constrained by on-chain policy and governance tiers:
- **Tier 0:** observe-only (no writes).
- **Tier 1:** auto-mitigate safe actions (restart/throttle) after governance ratification.
- **Tier 2:** parameter changes (fees/limits) require governance proposal + timelock.
- **Tier 3:** critical actions (key rotation, validator set) require multisig + governance + timelock.

Policy enforcement is anchored by the L1 `AgentGovernancePolicy` registry:
- Actions are keyed as `keccak256(abi.encodePacked(target, selector))`.
- Policies include tier, cooldown, approvals required, scope, and evidence hash.
- `AICommandCenter` can optionally enforce and record policy actions via `setPolicyRegistry`.

Proposal builder:
- `contracts/scripts/ai/build_ai_action_ratification.ts` generates deterministic calldata with evidence hash for ratifying an action policy.

Devnet verification (L1):
1. Deploy `AgentGovernancePolicy` and `AICommandCenter`.
2. Call `AgentGovernancePolicy.setExecutor(AICommandCenter, true)`.
3. Call `AICommandCenter.setPolicyRegistry(policyRegistry, role, true, true)`.
4. Generate a ratification proposal with `build_ai_action_ratification.ts` and queue via governance.
5. Verify `AgentGovernancePolicy.canExecute(role, action, approvals, hasEvidence)` returns `true`.
