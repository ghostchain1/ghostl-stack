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
