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

## Handle Repeated Failures
- Inspect fingerprints: `GET /v1/ai-core/fingerprints`
- Check suppression rules: `GET /v1/ai-core/suppression-rules`
- Adjust policy constraints for the affected chain.

## Debug Deployment Failures
1. Inspect deployment attempts in `/observability/gas/deployments/:id`.
2. Review classification and trace data.
3. If TOOLING_BUG, validate Foundry flags and raw transaction path.
4. If CHAIN_CONFIG_BUG, review gas policy and RPC node configuration.
