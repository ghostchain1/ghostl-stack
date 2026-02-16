# Runbooks (skeleton)

## Bring-up

1) `cd tools/ghostcontrol`
2) `bash infra/compose/gen-dev-keys.sh`
3) `bash infra/compose/up.sh`

UI: `http://localhost:7400`  
API: `http://localhost:7401/health`

## Common failures

### `docker-socket-proxy` denies Runner actions

- Symptom: Runner evidence shows Docker API errors.
- Fix: adjust the proxy allowlist in `tools/ghostcontrol/infra/compose/docker-compose.yml`.

### Host Docker socket permission denied for `ghost`

- Symptom: host command prints `permission denied while trying to connect to the Docker daemon socket`.
- Fix (safe per-command): prefix docker commands with `sg <socket-group> -c 'docker ...'`.
- Fix (interactive shell): run `newgrp <socket-group>` once, then re-run `id` and `docker ps`.
- Note: GhostControl automation now detects `GHOST_DOCKER_GROUP`/`DOCKER_SOCKET_GROUP` (or `/var/run/docker.sock` group) and falls back to `docker` via `tools/ghostcontrol/deploy/docker_access.ts`.

### Policy blocks action requests

- Symptom: Planner logs `policy_denied_*`.
- Fix: update allowlists:
  - `tools/ghostcontrol/apps/policy/config/risk-allowlist.json`
  - `tools/ghostcontrol/apps/policy/config/action-scopes.json`

### RPC probes failing constantly

- Symptom: repeated `rpc_probe` incidents.
- Fix: set `L1_RPC`/`L2_RPC`/`L3_RPC` in the compose environment.

## Event-Driven Checks (steady state)

After the final green stabilization checkpoint, run GhostLoop only when there is a relevant event instead of manual `proceed` loops.

### Trigger events

- Any change to compose/policy/invariant config
- Any deploy or image rebuild
- Any Prometheus/Alertmanager alert
- Any new incident intake in SQLite
- Any failing test or Trivy gate

### Run one event cycle

1) `cd /home/ghost/ghostl-stack`
2) `bash tools/ghostcontrol/orchestrator/run_event_cycle.sh <event_reason>`

Example:

`bash tools/ghostcontrol/orchestrator/run_event_cycle.sh deploy_compose_update`

Optional environment overrides:

- `ITERATION_OVERRIDE=40`
- `VM_TARGET=devnet|testnet|mainnet`
- `RISK_BUDGET=LOW|MED|HIGH`
- `GOVERNANCE_MODE=NONE|DEVNET|TESTNET|MAINNET`
- `COMPOSE_FILE=tools/ghostcontrol/infra/compose/docker-compose.yml`
- `GHOST_DOCKER_GROUP=ghost`

Primary outputs:

- `tools/ghostcontrol/evidence/logs/iteration-<n>-event-context.json`
- `tools/ghostcontrol/evidence/logs/iteration-<n>-ghostloop-result.json`
- `tools/ghostcontrol/evidence/logs/iteration-<n>-package-evidence.json`
