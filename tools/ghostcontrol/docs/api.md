# API (skeleton)

Auth:

- Optional header: `X-GhostControl-Token`
- When `GHOSTCONTROL_TOKEN` is unset, API allows requests (dev mode).

Endpoints:

- `GET /health` – service + dependency check
- `GET /status` – counts + RPC probe snapshot + lock-contention summary + RPC-preflight mitigation summary + event-cycle incident posture
- `GET /governance/lock-contention` – lock-contention mitigation trend from iteration artifacts
- `GET /governance/rpc-preflight` – RPC-preflight mitigation trend from event-cycle artifacts
- `GET /governance/event-cycle-incidents` – governance-critical event-cycle incidents (`lock contention`, `rpc preflight`, `disk pressure`) from `incidents.db`
- `GET /incidents` – latest 100 incidents
- `POST /actions/request` – create action request (queued)
- `POST /actions/submit` – submit signed action bundle (queued to runner)
- `GET /evidence` – latest 100 evidence rows
- `POST /evidence` – runner posts evidence

Lock-contention summary notes:

- `recent` and `latest` are ordered by `generatedAtUtc` (newest first), with iteration as tie-breaker.

RPC-preflight mitigation summary notes:

- `recent` and `latest` are ordered by `generatedAtUtc` (newest first).
- Sources include `event-cycle-rpc-preflight-mitigation-*.json` and `manual-rpc-preflight-mitigation-*.json`.

Event-cycle incident posture notes:

- Reads the local ledger from `GHOSTCONTROL_INCIDENT_DB_PATH` (default `/incidents/incidents.db`).
- Includes `alert` with thresholded open-incident posture (`state: ok|warning`).
- `totals` and `recent` are scoped to tracked governance summaries:
  - `run_event_cycle lock contention timeout`
  - `run_event_cycle rpc preflight degraded`
  - `run_event_cycle host disk pressure`
- `openIncidentThreshold` comes from `GHOSTCONTROL_EVENT_CYCLE_OPEN_WARN_THRESHOLD` (default `1`).
