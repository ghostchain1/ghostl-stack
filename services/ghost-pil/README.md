# Ghost Protocol Intelligence Layer (PIL)

Read-only data plane for GhostChain L1/L2/L3 telemetry, jurisdiction modeling, and compliance signal tracking. Defaults to ADVISORY.

## Env Flags

- `PIL_ENABLED` (default: false): Enables autonomous behavior when future phases are turned on.
- `PIL_AUTONOMY_MODE` (default: ADVISORY)
- `PIL_WRITE_ENABLED` (default: false)
- `PIL_APPROVAL_REQUIRED` (default: true)
- `PIL_INGEST_ENABLED` (default: true): Enables RPC ingestion loop.
- `PIL_RPC_NAMESPACE` (optional): Force `eth` or `ghost` RPC method namespace.

## Local Run (Docker Compose)

```
docker compose -f services/pil-postgres/docker-compose.yml up -d
docker compose -f services/pil-migrate/docker-compose.yml up -d
docker compose -f services/ghost-pil/docker-compose.yml up -d
docker compose -f services/ghost-pil-worker/docker-compose.yml up -d
```

## Key Endpoints

- `GET /health`
- `GET /v1/chains`
- `GET /v1/ingest/status`
- `GET /v1/jurisdictions`
- `GET /v1/legal-signals`
- `GET /v1/policy-packs`
- `GET /v1/policy-packs/active`
- `POST /v1/decisions/evaluate`
- `POST /v1/attestations`
- `GET /v1/attestations`
- `POST /v1/preflight/evaluate`
- `GET /v1/simulations`
- `GET /v1/recommendations`
- `GET /v1/metrics/summary`
- `GET /metrics` (Prometheus)

## Safety

PIL does not submit transactions or execute chain changes. All actions are read-only by default. Autonomy flags remain disabled unless explicitly enabled.

## ZK Attestations (Phase 1)

Attestation endpoints accept proof hashes only. Verification remains hash-only (UNVERIFIED) until a concrete ZK verifier plugin is configured.
