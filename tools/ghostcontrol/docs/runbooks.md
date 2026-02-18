# Runbooks (skeleton)

## Bring-up

1) `cd tools/ghostcontrol`
2) `bash infra/compose/gen-dev-keys.sh`
3) `bash infra/compose/up.sh`

UI: `http://localhost:7400`  
API: `http://localhost:7401/health`

Governance posture endpoint:

- `http://localhost:7401/governance/event-cycle-incidents`
- Backed by `tools/ghostcontrol/incidents/incidents.db` mounted read-only into `ghostcontrol-api`.

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
- `GOVERNANCE_PROPOSAL_ID=gp-<id>` (required when `GOVERNANCE_MODE=MAINNET`)
- `GOVERNANCE_GATE_FILE=/home/ghost/ghostl-stack/tools/ghostcontrol/governance/gates/<proposal>.json`
- `COMPOSE_FILE=tools/ghostcontrol/infra/compose/docker-compose.yml`
- `GHOST_DOCKER_GROUP=ghost`
- `LOCK_WAIT_SECONDS=900` (max wait for cycle lock before failing)
- `MIN_FREE_DISK_MB=4096` (minimum host free space before disk-pressure incident)
- `DISK_PRESSURE_MODE=warn|fail` (`warn` records incident and continues, `fail` records incident and exits)
- `RPC_PREFLIGHT_MODE=warn|fail` (`fail` by default; degraded RPC preflight records incident and exits)
- `RPC_PREFLIGHT_RETRIES=3` (eth_chainId probe attempts per layer before degradation)
- `RPC_PREFLIGHT_RETRY_DELAY_SECONDS=3` (delay between eth_chainId retry attempts)
- `RPC_AUTO_REMEDIATION_ENABLED=true|false` (`true` by default; attempt bounded container restarts on degraded RPC preflight)
- `RPC_AUTO_REMEDIATION_MAX_ATTEMPTS=1` (number of remediation rounds before final preflight decision)
- `RPC_AUTO_REMEDIATION_DELAY_SECONDS=5` (wait between remediation attempt and re-probe)
- `RPC_AUTO_REMEDIATION_L1_CONTAINERS=<csv>` (fallback restart targets when L1 port mapping is unavailable)
- `RPC_AUTO_REMEDIATION_L2_CONTAINERS=<csv>` (fallback restart targets when L2 port mapping is unavailable)
- `RPC_AUTO_REMEDIATION_L3_CONTAINERS=<csv>` (fallback restart targets when L3 port mapping is unavailable)
- `GHOSTCONTROL_EVENT_CYCLE_OPEN_WARN_THRESHOLD=1` (API governance posture warning threshold for open event-cycle incidents)
- Set any of the fallback container lists to an empty string to disable layer fallback restarts.
- `L1_RPC=http://localhost:18545`
- `L2_RPC=http://localhost:29547`
- `L3_RPC=http://localhost:39545`
- `L1_CHAIN_ID=14000101`
- `L2_CHAIN_ID=901`
- `L3_CHAIN_ID=903`

`RPC_L1`/`RPC_L2`/`RPC_L3` aliases are also accepted.

Lock contention behavior:

- If `run_event_cycle.sh` cannot acquire its lock before `LOCK_WAIT_SECONDS`, it fails fast.
- It also writes lock-timeout evidence to `tools/ghostcontrol/evidence/logs/event-cycle-lock-timeout-*.json`
- And records an incident in `tools/ghostcontrol/incidents/incidents.db` (`service=event-cycle`).
- After a successful event cycle, open lock-timeout incidents are auto-mitigated and logged to `tools/ghostcontrol/evidence/logs/iteration-<n>-lock-contention-mitigation.json`

Disk pressure behavior:

- Before lock acquisition, `run_event_cycle.sh` checks host free disk (`df -Pk`) under `/home/ghost/ghostl-stack`.
- If free space is below `MIN_FREE_DISK_MB`, it writes evidence to `tools/ghostcontrol/evidence/logs/event-cycle-disk-pressure-*.json`
- It also inserts an incident in `tools/ghostcontrol/incidents/incidents.db` (`summary=run_event_cycle host disk pressure`).
- In `DISK_PRESSURE_MODE=fail`, the script exits immediately after incident capture.

RPC preflight behavior:

- Before lock acquisition, `run_event_cycle.sh` probes `eth_chainId` on L1/L2/L3 with retries.
- Probe evidence is written to `tools/ghostcontrol/evidence/logs/event-cycle-rpc-preflight-*.json`
- If degraded and `RPC_AUTO_REMEDIATION_ENABLED=true`, the script attempts bounded container restarts and re-probes.
- Remediation evidence is written to `tools/ghostcontrol/evidence/logs/event-cycle-rpc-remediation-*.json` and `*.log`
- If remediation recovers RPC health in the same cycle, open `run_event_cycle rpc preflight degraded` incidents are auto-downgraded to `mitigated`.
- Recovery mitigation evidence is written to `tools/ghostcontrol/evidence/logs/event-cycle-rpc-preflight-mitigation-*.json`
- If any layer is degraded (timeout/fetch/parse/chain-id mismatch), it inserts an incident in `tools/ghostcontrol/incidents/incidents.db` (`summary=run_event_cycle rpc preflight degraded`).
- In `RPC_PREFLIGHT_MODE=fail` (default), the script exits immediately after incident capture.

Note: GhostLoop now treats L1/L2/L3 `eth_chainId` checks as required preflight gates.
An RPC endpoint that responds with the wrong chain ID will force a `HOLD` checkpoint.
When `GOVERNANCE_MODE=MAINNET`, a proposal gate with `allowDeploy: true` is required.

Primary outputs:

- `tools/ghostcontrol/evidence/logs/iteration-<n>-event-context.json`
- `tools/ghostcontrol/evidence/logs/iteration-<n>-ghostloop-result.json`
- `tools/ghostcontrol/evidence/logs/iteration-<n>-package-evidence.json`
- `tools/ghostcontrol/evidence/attestations/iteration-<n>-chain-identity-attestation.json` (signed)
- `tools/ghostcontrol/evidence/logs/iteration-<n>-lock-contention-mitigation.json`

### Run continuous event watcher

Use the watchdog to auto-trigger GhostLoop on compose/config/git/prometheus changes:

`node --experimental-strip-types tools/ghostcontrol/orchestrator/event_watchdog.ts`

Optional watchdog flags:

- `--interval-ms 20000`
- `--cooldown-ms 45000`
- `--prometheus-url http://localhost:9090`
- `--watch-file tools/ghostcontrol/infra/compose/docker-compose.yml`
- `--status-path tools/ghostcontrol/evidence/logs/event-watchdog.status.json`
- `--heartbeat-log-interval-ms 60000`

### Systemd watchdog service

Install host-managed watchdog + healthcheck timer:

`bash tools/ghostcontrol/infra/systemd/install_event_watchdog_service.sh`

Verify units:

- `sudo systemctl status ghostcontrol-event-watchdog.service`
- `sudo systemctl status ghostcontrol-event-watchdog-healthcheck.timer`
- `sudo systemctl status ghostcontrol-event-watchdog-recovery.service`

Manual health check:

`node --experimental-strip-types tools/ghostcontrol/orchestrator/watchdog_healthcheck.ts`

Manual recovery run (restart + recheck + incident capture if still unhealthy):

`node --experimental-strip-types tools/ghostcontrol/orchestrator/watchdog_recovery.ts`

Live-fire recovery drill (forces healthcheck failure, verifies `OnFailure`, verifies restart recovery, auto-restores defaults):

`bash tools/ghostcontrol/infra/systemd/livefire_watchdog_recovery_drill.sh`

Staleness tuning:

- `GHOSTCONTROL_WATCHDOG_MAX_STALE_SECONDS=120` (default)

Heartbeat status file:

- `tools/ghostcontrol/evidence/logs/event-watchdog.status.json`

Failure automation:

- Healthcheck service uses `OnFailure=ghostcontrol-event-watchdog-recovery.service`
- Recovery service attempts `systemctl restart ghostcontrol-event-watchdog.service`
- If unrecovered, it writes incident evidence and inserts a critical incident in `tools/ghostcontrol/incidents/incidents.db`
- Recovery restart path uses `sudo -n` when running as `ghost`, so passwordless sudo is required
- Live-fire drill writes summary evidence to `tools/ghostcontrol/evidence/logs/event-watchdog-livefire-*.json`
