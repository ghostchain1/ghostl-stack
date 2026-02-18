# HGOP Runbooks

## Build + Test

```bash
cd services/hyper-ghost-supervisor
npm ci
npm run build
npm test
```

## Run Locally (No Docker)

```bash
cd services/hyper-ghost-supervisor
HG_ENV=devnet \\
HG_BIND=127.0.0.1 \\
HG_PORT=7077 \\
HG_DB_PATH=./.data/incident.db \\
HG_DB_SEED_DEMO=1 \\
L1_RPC_URL=http://127.0.0.1:18545 \\
L2_RPC_URL=http://127.0.0.1:29547 \\
L3_RPC_URL=http://127.0.0.1:39545 \\
npm run dev
```

## Run In Docker (Dev Stack)

```bash
./dev-stack.sh
docker compose -f infra/opstack/docker-compose.yml logs -f hyper-ghost-supervisor
```

## Seed Demo Data

Seed is controlled by env:

- `HG_DB_SEED_DEMO=1`

If you already have incidents, the seed is skipped.

## Generate a Proposal

1. Create an incident:

```bash
curl -fsS http://127.0.0.1:7077/incidents \\
  -H 'content-type: application/json' \\
  -d '{\"scope\":\"rollup:l3\",\"severity\":\"P1\",\"title\":\"L3 finality lag\"}' | jq .
```

2. Generate proposal:

```bash
curl -fsS http://127.0.0.1:7077/proposals/generate \\
  -H 'content-type: application/json' \\
  -d '{\"incidentId\":\"inc_...\"}' | jq .
```

## Generate Governance Bundle (CMF)

```bash
curl -fsS http://127.0.0.1:7077/proposals/prop_.../submit-governance \\
  -H 'content-type: application/json' \\
  -d '{}' | jq .
```

Artifacts appear under:

- `/var/lib/ghost/hgop/CMF/<proposal_id>/...` (container)
- `hyperghost_data` volume (host-managed)

