# Normalized Log Schema

Every log event returned by /observability/logs/api/query is normalized to:

- timestamp: ISO-8601 UTC timestamp
- timestampNs: optional nanosecond timestamp (string)
- layer: L1 | L2 | L3 | INFRA | UNKNOWN
- chain: GhostChain | GhostL2 | GhostL3 | Infrastructure | Unknown
- component: service or container identifier
- severity: INFO | WARN | ERROR | CRITICAL | SLASHING_RISK | CONSENSUS_RISK | SECURITY_EVENT | AI_DECISION
- event: normalized event slug
- message: human-readable message
- traceId, requestId: correlation IDs when available
- txHash, blockNumber: chain context when available
- nodeId: originating node/instance
- labels: Loki labels
- details: parsed JSON payload (redacted)

Normalization rules:
- JSON payloads are parsed when present and secrets are redacted.
- Layer/chain are inferred from labels and component names.
- Severity is upgraded when security, slashing, or consensus risk signals are detected.
