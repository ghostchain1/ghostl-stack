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

Canonical gas token (L1 ERC‑20):
- Contract: `0x5FbDB2315678afecb367f032d93F642f64180aa3`
- Symbol: `GST`
- Genesis mint: `1,000,000,000` GST to `0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266`
- L2/L3 gas token source: L1 ERC‑20 address above

## Safety Defaults

Autonomy is disabled by default (`PIL_AUTONOMY_MODE=ADVISORY`). The service runs read-only ingestion only.

## Preflight (Advisory)

`POST /v1/preflight/evaluate` returns ALLOW/WARN/BLOCK decisions based on policy packs and proof hashes. In Phase 1 this is advisory only and does not block RPC traffic.
