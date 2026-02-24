# ghostload-controller

Actuator service implementing `plan -> validate -> canary -> apply -> verify`.

## Endpoints
- `GET /health`
- `GET /status`
- `POST /apply`

## Safety
- Kill switch + manual override lock
- Critical changes require manual actor path
- Signed append-only audit log (`/data/audit.log`)
