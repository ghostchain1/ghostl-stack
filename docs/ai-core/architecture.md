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
- Formal invariants: `docs/ai-core/invariants.md`.

## Governance-Locked Autonomy (L1)
Autonomous actions are constrained by on-chain policy and governance tiers:
- **Tier 0:** observe-only (no writes).
- **Tier 1:** auto-mitigate safe actions (restart/throttle) after governance ratification.
- **Tier 2:** parameter changes (fees/limits) require governance proposal + timelock.
- **Tier 3:** critical actions (key rotation, validator set) require multisig + governance + timelock.

Policy enforcement is anchored by the L1 `AgentGovernancePolicy` registry for action-level controls and the
`PolicyRegistry` for chain-wide constraints:
- `PolicyRegistry` stores bounded policy values with activation delays, emergency expiry, and checkpoints.
- `AIProposalExecutor` validates quorum signatures, records evidence in `EvidenceVault`, and applies policy updates.
- `EvidenceVault` commits hashes for simulations, explanations, and attestations with signer metadata.
- Actions are keyed as `keccak256(abi.encodePacked(target, selector))`.
- Policies include tier, cooldown, approvals required, scope, and evidence hash.
- `AICommandCenter` can optionally enforce and record policy actions via `setPolicyRegistry`.

Deterministic enforcement hooks (L1):
- `ProposalExecutor.execute()` enforces `ConstitutionalGuard.checkGovernance()` before any queued action.
- `AIProposalExecutor.executePolicyUpdate()` invokes `ConstitutionalGuard.checkGovernance()` for policy updates.
- `PolicyRegistry` emits `PolicyCheckpoint` events consumed by downstream validators/services.

## Cross-Chain Federation
L1 is the constitutional root for chain-wide policy. L2 and L3 inherit constraints from upstream
policy registries and must refuse actions if upstream policy is missing. See
`docs/ai-core/federation.md` for export commands and invariants.

## Evidence + Proposal Pipeline
- `ghost-gas-engine` can emit deterministic evidence bundles and proposal payloads for `AIProposalExecutor`.
- Admin endpoint: `POST /v1/ai-core/policy-proposals` generates:
  - `evidenceHash` + `metadataHash`
  - `PolicyUpdate` payload (policyKey/value/nonce/issuedAt/validUntil)
  - `updateHash` + EIP-712 digest for signer quorum
- `explainability` is required in policy proposals (rationale, assumptions, expectedImpact, rollbackPlan, confidence, modelVersion).
- Evidence bundles can be written to disk (`AI_EVIDENCE_OUTPUT_DIR`) and optionally committed to `EvidenceVault`
  (`AI_EVIDENCE_AUTO_COMMIT=true` + vault RPC + submitter key).
- Optional signer quorum flow:
  - Configure `AI_PROPOSAL_SIGNER_KEYS` to emit EIP-712 signatures for the `PolicyUpdate` digest.
  - Set `AI_PROPOSAL_AUTO_SUBMIT=true` + `AI_PROPOSAL_SUBMITTER_KEY` to broadcast `executePolicyUpdate`.

L1 devnet governance deployment (chainId `14000101`, 0xd59fe5):
- Constitution hash: `0x1b3c479b7f8f1a6e67ac40798d56bde7509c68d7760c17a14fc7ba9cc907f816`
- AIConstitutionalProposal: `0x07882Ae1ecB7429a84f1D53048d35c4bB2056877`
- Governor: `0xdbC43Ba45381e02825b14322cDdd15eC4B3164E6`
- Executor: `0x7bc06c482DEAd17c0e297aFbC32f6e63d3846650`
- PolicyRegistry (chain policy): `0x1c85638e118b37167e9298c2268758e058DdfDA0`
- EvidenceVault: `0xC9a43158891282A2B1475592D5719c001986Aaec`
- AIProposalExecutor: `0x367761085BF3C12e5DA2Df99AC6E1a824612b8fb`
- AgentGovernancePolicy (action policy): `0x99bbA657f2BbC93c02D617f8bA121cB8Fc104Acf`
- AgentRegistry: `0x36C02dA8a0983159322a80FFE9F24b1acfF8B570`
- Policy executor (governor for PolicyRegistry/EvidenceVault/AIProposalExecutor): `0xf4B146FbA71F41E0592668ffbF264F1D186b2Ca8` (delay 600s)

Source of truth:
- `services/stack.env`
- `contracts/reports/ai_constitutional_deployment.json`
- `contracts/reports/ai_constitutional_proposal.json`
- `contracts/reports/ai_constitutional_proposal_id.json`
- `contracts/reports/policy_primitives_status.json`

Verification:

```bash
cd contracts
npx hardhat run --network anvil scripts/governance/check_policy_primitives.ts
```

Proposal builder:
- `contracts/scripts/ai/build_ai_action_ratification.ts` generates deterministic calldata with evidence hash for ratifying an action policy.

Devnet verification (L1):
1. Deploy `AgentGovernancePolicy` and `AICommandCenter`.
2. Call `AgentGovernancePolicy.setExecutor(AICommandCenter, true)`.
3. Call `AICommandCenter.setPolicyRegistry(policyRegistry, role, true, true)`.
4. Generate a ratification proposal with `build_ai_action_ratification.ts` and queue via governance.
5. Verify `AgentGovernancePolicy.canExecute(role, action, approvals, hasEvidence)` returns `true`.
