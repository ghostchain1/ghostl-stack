# Unified Compose Files

These compose files are generated from existing configs to provide a clearer separation of domains.
They are **non-destructive** and do not replace the original compose files.

## Files

- `docker-compose.core.yml`: GhostChain L1/L2/L3 chain services and OP Stack components.
- `docker-compose.services.yml`: API and supporting services (includes compliance stack).
- `docker-compose.ui.yml`: UI frontends only.
- `docker-compose.obs.yml`: Observability stack (Prometheus/Grafana/Loki).
- `docker-compose.ai.yml`: AI-related services.

## Zero-Downtime Rules

- Do **not** change container names, volumes, or ports for running services.
- When bringing up chain services, use `--no-recreate` and the existing project name.
- These files are for future orchestration and do not require immediate use.

## Example Usage (Safe)

```bash
# Example: start UI services without recreating existing containers
# docker compose -f infra/docker/compose/docker-compose.ui.yml -p ghostl --no-recreate up -d
```

## Source Tracking

Each compose file includes `x-ghost-source-files` listing the original source files.
