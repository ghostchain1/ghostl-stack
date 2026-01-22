# ghost-ui

Next.js compliance dashboard for GhostChain.

## Dev

```bash
npm install
npm run dev
```

## Environment

- `NEXT_PUBLIC_COMPLIANCE_URL` (client)
- `COMPLIANCE_URL` (server)
- `COMPLIANCE_ANALYST_JWT` (server-only JWT for audit endpoints)

## Pages

- `/compliance/overview`
- `/compliance/decisions`
- `/compliance/policies`
- `/compliance/laws`
- `/compliance/predictions`
- `/compliance/evidence`
- `/compliance/controls`

## Tests

```bash
npm run test:e2e
```

Tests assume `docker compose up --build` is running.
