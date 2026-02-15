# Hyper Ghost Supervisor (HGOP v1)

Hyper Ghost Supervisor is the incident + proposal + deterministic fix ranking service for GhostL-Stack.

## Local run

```bash
cd services/hyper-ghost-supervisor
npm ci
HG_ENV=devnet HG_PORT=7077 HG_DB_PATH=./.data/incident.db npm run dev
```

## Endpoints

- `GET /health`
- `GET /status`
- `GET /metrics` (Prometheus)
- `GET /incidents`
- `POST /incidents`
- `GET /incidents/:id`
- `POST /incidents/:id/evidence`
- `POST /proposals/generate`
- `GET /proposals`
- `GET /proposals/:id`
- `POST /proposals/:id/attest`
- `POST /proposals/:id/submit-governance`
- `POST /execute/:proposalId/:fixId` (gated)

## Compose

This repo wires the service into `infra/opstack/docker-compose.yml` on port `7077`.

