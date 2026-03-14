# Smoke Tests

## Compose Validation

- `docker compose -f infra/docker/compose/docker-compose.core.yml config`
- `docker compose -f infra/docker/compose/docker-compose.services.yml config`
- `docker compose -f infra/docker/compose/docker-compose.ui.yml config`
- `docker compose -f infra/docker/compose/docker-compose.obs.yml config`
- `docker compose -f infra/docker/compose/docker-compose.ai.yml config`

## Runtime

- All previously running containers are still running.
- No chain container recreation (container IDs unchanged).
- RPC endpoints respond with correct chainId.
- UI responds over HTTP.
- Observability endpoints respond (Prometheus/Grafana/Loki if enabled).
- No crash loops in logs (last 200 lines).

## Expected Outputs

- Each check prints PASS or FAIL.
- Script exits non-zero on any critical failure.
