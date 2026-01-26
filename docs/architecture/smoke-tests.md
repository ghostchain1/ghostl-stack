# Compliance Phase Smoke Tests

## Phase 1 - Data Plane

- Start PIL stack:
  - `docker compose -f services/pil-postgres/docker-compose.yml up -d`
  - `docker compose -f services/pil-migrate/docker-compose.yml up -d`
  - `docker compose -f services/ghost-pil/docker-compose.yml up -d`
  - `docker compose -f services/ghost-pil-worker/docker-compose.yml up -d`
- Verify health:
  - `curl http://localhost:3220/health`
  - `curl http://localhost:3220/v1/chains`
- Verify UI pages:
  - `/protocol/intelligence`
  - `/protocol/risk`
  - `/protocol/security`

## Phase 2 - Digital Twin (future)

- Run: `./scripts/pil/smoke-phase2.sh`
- `GET /v1/simulations` returns runs
- `GET /v1/simulations/:id/results` returns results

## Phase 3 - Autonomy (future)

- Enable: `PIL_ENABLED=true`, `PIL_WRITE_ENABLED=true`, `PIL_AUTONOMY_MODE=ASSISTED`
- Run: `./scripts/pil/smoke-phase3.sh`
- Preflight decisions return ALLOW/WARN/BLOCK

## Phase 4 - Governance (future)

- Run: `./scripts/pil/smoke-phase4.sh`
- Validator compliance scores available
