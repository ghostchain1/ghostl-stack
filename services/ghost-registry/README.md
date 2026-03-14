# Ghost Registry Service

Purpose
- Public, read-only discovery API for GhostChain RPC endpoints.
- Stateless, cacheable, privacy-preserving.
- No tracking, no analytics, no per-consumer metrics.

API
- `GET /v1/endpoints`
- Public, no auth.
- Response includes the required `/v1/endpoints` schema used by GhostChain services and UI.

Caching
- `Cache-Control: public, max-age=60, s-maxage=300, stale-while-revalidate=600`
- `ETag` header for CDN + client caching.

Health checks
- Background job pings each RPC endpoint (HTTP JSON-RPC or WS handshake).
- Updates `health.status`, `health.latencyMs`, `health.lastChecked` in-memory.
- Uses retry + cooldown to avoid flapping and runaway probes.
- No request logging or per-client tracking.

Data
- Endpoints are configured via environment (`RPC_L1`, `RPC_L2`, `RPC_L3`, optional `*_WS`).
- Health data is updated in memory only.

How to run
```bash
cd services/ghost-registry
npm install
npm run dev
```

Environment
- `PORT` (default 8088)
- `HEALTH_INTERVAL_MS` (default 60000)
- `HEALTH_TIMEOUT_MS` (default 1500)
- `HEALTH_DEGRADED_MS` (default 1200)
- `HEALTH_RETRY_COUNT` (default 1)
- `HEALTH_COOLDOWN_MS` (default 15000)
- `RPC_L1`, `RPC_L2`, `RPC_L3` (comma-separated)
- `RPC_L1_WS`, `RPC_L2_WS`, `RPC_L3_WS` (optional, comma-separated)
- `GAS_TOKEN_L1`, `GAS_TOKEN_L2`, `GAS_TOKEN_L3`

How to add/update endpoints
- Update the `RPC_L*` env vars in `services/stack.env` or your deployment config.
- Health metadata is updated automatically by the checker.

Privacy guarantees
- No tracking.
- No per-client metrics.
- No IP/user fingerprint storage.
- No analytics or telemetry endpoints.
