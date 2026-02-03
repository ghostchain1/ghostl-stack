# AI Policy Ratification Flow

This runbook describes the governance and committee consensus flow for AI policy updates and action policies.

## 1) Build evidence + proposal (ghost-gas-engine)

Generate a deterministic evidence bundle + policy update payload:

```bash
curl -X POST http://localhost:3210/v1/ai-core/policy-proposals \
  -H "x-admin-token: $GAS_ENGINE_ADMIN_TOKEN" \
  -H "content-type: application/json" \
  -d '{
    "chainKey": "l1",
    "policyKey": "ghost.ai.policy.max_gas",
    "value": 30000000,
    "explainability": {
      "rationale": "Congestion trending higher than policy ceiling.",
      "assumptions": ["RPC latency within 200ms", "Base fee remains stable"],
      "expectedImpact": "Reduce failed transactions during peak usage.",
      "rollbackPlan": "Revert to previous policy after 1 hour if congestion clears.",
      "confidence": 0.71,
      "modelVersion": "risk-forecast-v1"
    }
  }'
```

Outputs:
- Evidence bundle JSON under `AI_EVIDENCE_OUTPUT_DIR`
- Policy proposal JSON under `AI_PROPOSAL_OUTPUT_DIR`

## 2) Evidence commit (optional)

Enable evidence commit with:

```
AI_EVIDENCE_AUTO_COMMIT=true
AI_EVIDENCE_VAULT_ADDRESS=0x...
AI_EVIDENCE_VAULT_RPC=http://localhost:18545
AI_EVIDENCE_SUBMITTER_KEY=0x...
AI_EVIDENCE_SIGNER_SET_HASH=0x...
AI_EVIDENCE_THRESHOLD=1
```

## 3) Signer quorum (committee)

Provide signer keys for quorum signatures:

```
AI_PROPOSAL_SIGNER_KEYS=0xkey1,0xkey2,0xkey3
AI_PROPOSAL_MIN_SIGNATURES=2
```

## 4) Submit to AIProposalExecutor (optional auto-submit)

```
AI_PROPOSAL_AUTO_SUBMIT=true
AI_PROPOSAL_EXECUTOR_ADDRESS=0x...
AI_PROPOSAL_EXECUTOR_RPC=http://localhost:18545
AI_PROPOSAL_SUBMITTER_KEY=0x...
```

If auto-submit is disabled, submit manually using the proposal payload and signatures.

## 5) Ratify action policies (governor)

For action policy ratification (AgentGovernancePolicy), build a governance proposal bundle:

```bash
cd contracts
AI_POLICY_ADDRESS=0x... \
AI_ACTION_TARGET=0x... \
AI_ACTION_SELECTOR=0x12345678 \
AI_ACTION_EVIDENCE_HASH=0x... \
PROPOSAL_EXECUTOR_ADDRESS=0x... \
node scripts/ai/build_ai_action_ratification.ts
```

Queue and execute via the governor/timelock.

## 6) Verification

- Evidence recorded in `EvidenceVault` (optional)
- Policy activated in `PolicyRegistry` or `AgentGovernancePolicy`
- Checkpoints emitted (PolicyRegistry `PolicyCheckpoint` event)

```bash
cd contracts
npx hardhat run --network anvil scripts/governance/check_policy_primitives.ts
```
