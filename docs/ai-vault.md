# AI Vault (Custom)

`ai-vault` is a policy-enforcing, AI-assisted Vault gateway for GhostChain. It provides:

- **Real-time enforcement** (allow/deny) on secret access
- **Anomaly detection** (rate + burst)
- **Auto-rotation** of secrets
- **Proxy** interface for `/v1/*` Vault API
- **REST API** for policy, events, rotations

## Run (Docker Compose)

```bash
cp services/ai-vault/.env.example services/ai-vault/.env
docker compose -f services/docker-compose.legacy.yml up -d ai-vault
```

## Core env

- `VAULT_ADDR` (required)
- `VAULT_TOKEN` or `VAULT_ROLE_ID` + `VAULT_SECRET_ID`
- `SERVICES_ROOT` absolute path to the services directory (default: `/home/ghost/ghostl-stack/services`)
- `AI_VAULT_EXECUTE=1` to allow rotations + policy enforcement actions
- `AI_VAULT_DEFAULT_DECISION=deny|allow`

## Endpoints

- `GET /health`
- `GET /status`
- `GET /policy`, `PUT /policy`
- `GET /events`, `GET /anomalies`
- `POST /rotate`
- `GET /metrics`
- `ALL /v1/*` (Vault API proxy)

## Policy

Default policy template: `services/ai-vault/policy.generated.json` (generated)

Generate from stack env:

```bash
bash infra/scripts/ai-vault/generate-policy.sh
```

Set the Vault paths (KV v2) that hold all service secrets:

```
AI_VAULT_SECRET_PATHS=ghostchain/services,ghostchain/l1,ghostchain/l2
AI_VAULT_ROTATE_PATHS=ghostchain/l1
```

## Services mount

When running via `services/docker-compose.legacy.yml`, the host services directory is mounted read-only:

- Host: `/home/ghost/ghostl-stack/services`
- Container: `/services` (read-only)

Override the host path with `SERVICES_ROOT` in `services/stack.env` if needed.

Rotation rules support KV v2:

```json
{
  "mount": "ghostchain",
  "path": "l1",
  "kvVersion": 2,
  "keys": ["jwtsecret"],
  "encoding": "base64",
  "intervalMinutes": 1440
}
```

## Metrics

`GET /metrics` includes:

- `ai_vault_services_root_exists` (1 if `SERVICES_ROOT` exists in container, else 0)
- `ai_vault_services_mount_exists` (1 if `/services` mount exists, else 0)
- `ai_vault_services_root_resolved{path="..."}` (always 1; shows resolved path)

## Status payload

`GET /status` includes:

- `servicesRoot` (env-configured path; default `/services` in compose)
- `servicesRootExists`
- `servicesMount` (always `/services`)
- `servicesMountExists`
- `servicesRootResolved`
