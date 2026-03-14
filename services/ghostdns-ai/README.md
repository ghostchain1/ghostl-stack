# GhostDNS AI Microservice

GhostDNS AI runs BIND9 (authoritative + recursive with ACLs) and a FastAPI control plane in one hardened container.

## Endpoints

- `GET /health`
- `GET /metrics`
- `POST /reconcile`
- `GET /zone`
- `POST /records/upsert`
- `POST /records/delete`
- `POST /reload`
- `POST /set-mode`

## Security defaults

- No zone transfer (`allow-transfer { none; }`)
- Recursion only for `ALLOW_RECURSION_CIDRS`
- Mutating API in `prod` requires signed approval headers:
  - `X-GST-APPROVAL`
  - `X-GST-NONCE`
  - `X-GST-TIMESTAMP`
- Last-known-good snapshot rollback on validation/reload failure.

## Run

```bash
docker compose -f docker-compose.autonomy.yml --profile ghostdns up -d ghostdns-ai
```

## Test

```bash
cd services/ghostdns-ai
python3 -m pip install -r requirements.txt
PYTHONPATH=. pytest -q
```
