# ghost-mapper (Docker network port mapper)

`ghost-mapper` is a small TCP port-forwarding gateway that can sit on **multiple Docker networks** and bridge traffic between them.

It is **safe-by-default**:
- Mutating endpoints are disabled unless `MAPPER_EXECUTION_ENABLED=true`.
- When enabled, you must provide `x-admin-token: $MAPPER_ADMIN_TOKEN` for all write operations.
- Mappings can be persisted to `MAPPER_CONFIG_PATH` (default `/data/mappings.json`).

## HTTP API

- `GET /health`
- `GET /mappings`
- `GET /config`
- `POST /reload` (admin)
- `POST /mappings` (admin)
- `DELETE /mappings/:id` (admin)

## Mapping format

The persisted config file is:

```json
{
  "version": 1,
  "mappings": [
    {
      "id": "ghostl2-rpc",
      "enabled": true,
      "protocol": "tcp",
      "listen": { "host": "0.0.0.0", "port": 29547 },
      "target": { "host": "host.docker.internal", "port": 29547 },
      "notes": "Expose GhostL2 canonical RPC into ghost_net"
    }
  ]
}
```

## Run (per-service compose)

```bash
docker compose -f services/ghost-mapper/docker-compose.yml up -d --build
```

## Quick start (example mapping)

1) Create `services/ghost-mapper/data/mappings.json` from the example:

```bash
cp services/ghost-mapper/data/mappings.example.json services/ghost-mapper/data/mappings.json
```

2) Set `MAPPER_EXECUTION_ENABLED=true` and `MAPPER_ADMIN_TOKEN` (in `services/ghost-mapper/.env`), enable the mapping(s) you want, then reload:

```bash
export MAPPER_ADMIN_TOKEN='...'

curl -fsS -X POST http://localhost:7780/reload \
  -H "x-admin-token: $MAPPER_ADMIN_TOKEN"
```
