# ghost-compliance

Fastify-based compliance engine with deterministic policy evaluation, audit trails, evidence bundles, and attestations.

## Run locally

```bash
npm install
npm run dev
```

## Environment

See `.env.example`.

Key variables:
- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `ATTESTATION_PRIVATE_KEY`

## Endpoints

- `POST /v1/decision`
- `POST /v1/policies`
- `POST /v1/policies/:id/stage`
- `POST /v1/policies/:id/activate`
- `POST /v1/policies/simulate`
- `GET /v1/policies/active`
- `POST /v1/laws/ingest`
- `GET /v1/laws`
- `GET /v1/predictions`
- `GET /v1/audit/decisions`
- `GET /v1/audit/evidence/:bundleId`
- `GET /metrics`
- `GET /health`

## Auth

Admin routes require a JWT with a `role` claim of `admin`. Analyst routes accept `analyst` or `admin`.

## Tests

```bash
npm run test
```

API tests expect a running server at `COMPLIANCE_API_URL`.
