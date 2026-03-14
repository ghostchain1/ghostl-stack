# Operator Playbook

## Health Check
- API: `GET /health`
- AI status: `GET /v1/ai-core/status`
- Metrics: `GET /metrics`

## Pause Autonomy
Set:
```
AUTONOMY_ENABLED=false
```
or submit an override via `/v1/autonomy/override`.

## Review Governance Recommendations
- `GET /v1/ai-core/governance`
- Acknowledge: `POST /v1/ai-core/governance/:id/ack`

## Build Policy Proposal + Evidence
1. Generate an evidence-bound proposal:
   - `POST /v1/ai-core/policy-proposals`
   - Required body fields: `chainKey`, `policyKey`, `value`
2. Ensure evidence bundles are written:
   - Set `AI_EVIDENCE_OUTPUT_DIR` and keep artifacts for the evidence pack.
3. Signature quorum (optional):
   - Configure `AI_PROPOSAL_SIGNER_KEYS` to emit EIP-712 signatures in the response.
   - Set `AI_PROPOSAL_MIN_SIGNATURES` to enforce a minimum count.
4. Auto-submit (optional):
   - Set `AI_PROPOSAL_AUTO_SUBMIT=true`, `AI_PROPOSAL_SUBMITTER_KEY`, and `AI_PROPOSAL_EXECUTOR_RPC`.
- Verify the on-chain execution and EvidenceVault record.
- Follow `docs/ai-core/ratification.md` for the policy proposal → quorum → submission flow.

## Handle Repeated Failures
- Inspect fingerprints: `GET /v1/ai-core/fingerprints`
- Check suppression rules: `GET /v1/ai-core/suppression-rules`
- Adjust policy constraints for the affected chain.

## Debug Deployment Failures
1. Inspect deployment attempts in `/observability/gas/deployments/:id`.
2. Review classification and trace data.
3. If TOOLING_BUG, validate Foundry flags and raw transaction path.
4. If CHAIN_CONFIG_BUG, review gas policy and RPC node configuration.

## Go/No-Go Gate

Run the AI governance gate before production changes:

```bash
infra/scripts/gates/ai-go-no-go.sh
```
