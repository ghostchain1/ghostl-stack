# Protocol Intelligence Layer

The Protocol Intelligence Layer (PIL) provides read-only telemetry and compliance intelligence for GhostChain L1/L2/L3.

## UI Routes

- `/protocol/intelligence` - chain health and ingestion status
- `/protocol/risk` - jurisdiction risk tiers and legal signals
- `/protocol/security` - security signal feed
- `/protocol/economics` - gas token overview
- `/protocol/simulations` - simulation runs
- `/protocol/recommendations` - governance recommendations
- `/protocol/governance` - policy pack status

## Service URL

Set `NEXT_PUBLIC_PIL_URL` (client) and `PIL_URL` (server) to the ghost-pil API base URL.

## Safety Defaults

Autonomy is disabled by default (`PIL_AUTONOMY_MODE=ADVISORY`). The service runs read-only ingestion only.

## Preflight (Advisory)

`POST /v1/preflight/evaluate` returns ALLOW/WARN/BLOCK decisions based on policy packs and proof hashes. In Phase 1 this is advisory only and does not block RPC traffic.
