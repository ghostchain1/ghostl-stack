# GhostChain RPC Registry Service

Purpose
- Public, read-only discovery API for GhostChain RPC endpoints.
- Stateless, cacheable, privacy-preserving.
- No tracking, no analytics, no per-consumer metrics.

API
- `GET /v1/endpoints`
- Public, no auth.
- Response matches the canonical registry schema exactly.

Caching
- `Cache-Control: public, max-age=60, s-maxage=300, stale-while-revalidate=600`
- `ETag` header for CDN + client caching.

Health checks
- Background job pings each RPC endpoint (HTTP JSON-RPC or WS handshake).
- Updates `health.status`, `health.latencyMs`, `health.lastChecked` in-memory.
- No request logging or per-client tracking.

Data
- Authoritative config lives in `src/data/registry.json`.
- Health data is updated in memory only; registry file is not mutated.

How to run
```bash
cd services/rpc-registry-service
npm install
npm run dev
```

Environment
- `PORT` (default 8088)
- `REGISTRY_PATH` (optional path to registry.json)
- `HEALTH_INTERVAL_MS` (default 60000)
- `HEALTH_TIMEOUT_MS` (default 1500)
- `HEALTH_DEGRADED_MS` (default 1200)

How to add/update endpoints
- Edit `src/data/registry.json`.
- Keep schema fields exactly as specified.
- Health metadata will be updated automatically by the checker.

Privacy guarantees
- No tracking.
- No per-client metrics.
- No IP/user fingerprint storage.
- No analytics or telemetry endpoints.
