# ghostload-ai

Bounded autonomous decision service.

## Endpoints
- `GET /health`
- `GET /metrics`
- `GET /explain`
- `POST /decide`

## Safety
- Honors `GHOSTLOAD_KILL_SWITCH`
- Honors `GHOSTLOAD_MANUAL_ONLY`
- Validates every decision against `@ghostl/ghostload-policy`
- Falls back to safe baseline on rejection/error
