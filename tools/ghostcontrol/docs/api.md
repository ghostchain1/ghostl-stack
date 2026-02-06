# API (skeleton)

Auth:

- Optional header: `X-GhostControl-Token`
- When `GHOSTCONTROL_TOKEN` is unset, API allows requests (dev mode).

Endpoints:

- `GET /health` – service + dependency check
- `GET /status` – counts + RPC probe snapshot
- `GET /incidents` – latest 100 incidents
- `POST /actions/request` – create action request (queued)
- `POST /actions/submit` – submit signed action bundle (queued to runner)
- `GET /evidence` – latest 100 evidence rows
- `POST /evidence` – runner posts evidence

