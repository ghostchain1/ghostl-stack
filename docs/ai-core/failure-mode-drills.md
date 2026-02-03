# AI Governance Failure-Mode Drills

This guide captures repeatable drills to validate governance-locked autonomy under stress.
Run these in a non-production environment.

## Drill A — Adversarial Simulation (High-Risk Proposal)

Goal: ensure AI proposals with high risk or missing upstream checkpoints are rejected or quarantined.

1. Ensure AI proposals are gated:

   ```bash
   export CHAIN_POLICY_REQUIRED=1
   export CHAIN_POLICY_CHECKPOINT_HASH=0x<current-checkpoint-hash>
   export AI_PROPOSAL_AUTO_SUBMIT=false
   ```

2. Submit a policy proposal with aggressive values:

   ```bash
   curl -s -X POST http://localhost:3210/v1/ai-core/policy-proposals \
     -H "x-admin-token: $GAS_ENGINE_ADMIN_TOKEN" \
     -H "content-type: application/json" \
     -d '{
       "chainKey":"l2",
       "policyKey":"ghost.policy.gas.max",
       "value":999999999,
       "explainability":{
         "rationale":"stress test",
         "assumptions":[],
         "expectedImpact":"simulate adversarial surge",
         "rollbackPlan":"revert to previous policy",
         "confidence":0.4
       }
     }'
   ```

3. Verify response:

   - If the checkpoint hash is missing or mismatched, the API returns `missing_policy_checkpoint`
     or `policy_checkpoint_mismatch`.
   - If evidence or signatures are missing, the proposal is generated but cannot be executed.

## Drill B — Rollback Window Enforcement

Goal: validate that rollbacks are constrained to the configured rollback window.

1. Apply two sequential policy updates in a test environment.
2. Attempt rollback after the window expires.
3. Confirm the rollback attempt reverts and evidence is retained.

## Drill C — Emergency Scope Expiry

Goal: ensure emergency policy updates expire and cannot be used outside their configured window.

1. Apply an emergency update on a policy key with emergency enabled.
2. Advance time beyond the expiry window.
3. Confirm `PolicyRegistry.isEmergencyActive(key)` returns false.

## Evidence Requirements

- Archive evidence bundles and proposal payloads under `infra/evidence/out/`.
- Record the upstream policy checkpoint hash used for the drill.
- Capture any revert logs or failed transactions for audit evidence.
