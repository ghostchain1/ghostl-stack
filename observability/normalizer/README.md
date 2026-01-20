# Log Normalization

Normalization happens inside apps/api (see apps/api/src/modules/observability/log-helpers.ts).

Steps:
1. Parse JSON payloads when possible.
2. Redact secrets from labels and payloads.
3. Infer layer/chain/component from labels and message hints.
4. Classify severity into INFO/WARN/ERROR/CRITICAL/SLASHING_RISK/CONSENSUS_RISK/SECURITY_EVENT/AI_DECISION.
5. Extract trace_id, request_id, tx_hash, block_number, node_id.

Critical logs are appended to an immutable ledger in apps/api/src/modules/observability/critical-log-store.ts.
