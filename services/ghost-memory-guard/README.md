# ghost-memory-guard

`ghost-memory-guard` watches container memory and exposes a stability view for Ghost services.

It is designed for the current repo, where many services do not self-report heap metrics and the existing health layer is mostly HTTP polling.

## Features

- Docker stats polling over `/var/run/docker.sock`
- bounded sample retention per container
- warn and critical thresholds by percent and optional byte limits
- optional health endpoint correlation
- allowlisted auto-restart with cooldown and hourly circuit breaker
- incident journal for operator review

## Endpoints

- `GET /health`
- `GET /status`
- `GET /status/:container`
- `GET /incidents`
- `GET /metrics`

## Environment

- `DOCKER_SOCKET_PATH`
- `MEMORY_GUARD_POLL_INTERVAL_MS`
- `MEMORY_GUARD_WARN_PERCENT`
- `MEMORY_GUARD_RESTART_PERCENT`
- `MEMORY_GUARD_WARN_BYTES`
- `MEMORY_GUARD_RESTART_BYTES`
- `MEMORY_GUARD_SAMPLE_LIMIT`
- `MEMORY_GUARD_AUTO_RESTART`
- `CONTAINER_ALLOWLIST`
- `MEMORY_GUARD_RESTART_COOLDOWN_MS`
- `MEMORY_GUARD_MAX_RESTARTS_PER_HOUR`
- `MEMORY_GUARD_HEALTH_TARGETS` in `name|url,name|url` format
