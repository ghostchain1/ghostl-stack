# CAIS Model Lock and Freeze Controls

This repo enforces "model choice lock" and "output freeze" using on-chain gates for any AI-attested actions.

## On-Chain Enforcement Points

1. Model allowlist (execution-time gate)
   - Contract: `contracts/src/ai/AICommandCenter.sol`
   - Gate: `executeDecision()` requires `allowedModels[decision.modelId] == true`.
   - Policy knobs:
     - `setModel(bytes32 modelId, bool allowed)`
     - `setModelPolicy(bytes32 modelId, bool allowed, uint32 minConfidenceBps, bytes32 inputSchemaHash, bytes32 outputSchemaHash)`

2. Output freeze (execution-time gate)
   - Contract: `contracts/src/ai/AICommandCenter.sol`
   - Gate: `executeDecision()` reverts when `paused == true`.
   - Control: `setPaused(bool paused)`

3. Governance-native model lock + freeze (evidence-backed, recommended)
   - Contract: `contracts/src/ai/AIModelLock.sol`
   - Stores:
     - `modelId -> allowed` with `evidenceHash`
     - `frozen` with `freezeEvidenceHash`
   - Integration:
     - Call `AICommandCenter.setModelLock(<AIModelLock>)`
     - When set, `AICommandCenter.executeDecision()` additionally enforces:
       - `AIModelLock.frozen() == false`
       - `AIModelLock.isModelAllowed(decision.modelId) == true`

4. Governance escalation freeze (proposal-intent gate)
   - Contract: `contracts/src/ai/AIGovernanceEscalation.sol`
   - Gate: `submitIntent()` reverts when `paused == true`.
   - Control: `setPaused(bool paused)` (governance-only)

## Model Identifier Convention

Model IDs are `bytes32` values. Use a stable string-to-bytes32 mapping and never rename identifiers once ratified.

Recommended:
- `modelId = keccak256(utf8Bytes("gpt-5.2-thinking"))`
- `modelId = keccak256(utf8Bytes("gpt-5.2-codex-exec"))`

## Governance Process (Suggested)

1. Propose a constitutional update (or normal governance update, as applicable) that:
   - adds/removes allowed model IDs
   - adjusts per-model minimum confidence or schema hashes
   - activates/deactivates output freeze during incidents
2. Execute via the governed executor (timelock) to ensure changes are auditably gated.

## Proposal Builder

Use the repo script to generate deterministic calldata bundles:

```bash
cd contracts
AI_MODEL_LOCK_ADDRESS=0x... \
AI_COMMAND_CENTER_ADDRESS=0x... \
AI_MODEL_LOCK_WIRE_COMMAND_CENTER=true \
AI_MODEL_LOCK_ALLOW_MODELS="gpt-5.2-thinking,gpt-5.2-codex-exec" \
AI_MODEL_LOCK_FROZEN=false \
AI_MODEL_LOCK_EVIDENCE_HASH=0x... \
npx ts-node scripts/ai/build_model_lock_proposal.ts
```

See also:
- Draft Article X: `docs/ghostchain/charter_v1_1_draft.md`
- Constitutional bindings: `contracts/src/governance/AIConstitutionalProposal.sol` and `contracts/src/common/ConstitutionalGuard.sol`
