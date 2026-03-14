# ghost-health-aggregator

Central health dashboard for all GhostChain application services.

## Overview

Polls `/health`, `/healthz`, or `/readyz` on 40+ registered services and exposes a unified status page — usable by monitoring dashboards, alerting systems, and CI smoke tests.

## Endpoints

| Method | Path              | Description                              |
|--------|-------------------|------------------------------------------|
| GET    | `/health`         | Liveness probe for this service itself   |
| GET    | `/summary`        | Compact ok/degraded/down counts          |
| GET    | `/status`         | Full aggregated report (all services)    |
| GET    | `/status/:service`| Single-service poll (bypasses cache)     |

## Configuration

| Variable              | Default                    | Description                         |
|-----------------------|----------------------------|-------------------------------------|
| `PORT`                | `7640`                     | Bind port                           |
| `POLL_TIMEOUT_MS`     | `3000`                     | Per-service HTTP timeout             |
| `POLL_CACHE_MS`       | `10000`                    | Cache TTL for polling results        |
| `GHOSTBRAIN_CORE_URL` | `http://ghostbrain-core:7900` | Override per-service URLs          |
| ...                   | see `src/index.js`         | All service URLs are configurable   |

## Running

```bash
# Development
node --watch src/index.js

# Production (inside Docker)
node src/index.js
```

## Response Format

```json
{
  "overall": "ok",
  "total": 42,
  "counts": { "ok": 40, "degraded": 2, "down": 0 },
  "services": [
    {
      "id": "ghostbrain-core",
      "url": "http://ghostbrain-core:7900",
      "state": "ok",
      "latencyMs": 12,
      "checkedAt": "2025-01-01T00:00:00.000Z"
    }
  ],
  "ts": "2025-01-01T00:00:00.000Z"
}
```
