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

### Policy blocks action requests

- Symptom: Planner logs `policy_denied_*`.
- Fix: update allowlists:
  - `tools/ghostcontrol/apps/policy/config/risk-allowlist.json`
  - `tools/ghostcontrol/apps/policy/config/action-scopes.json`

### RPC probes failing constantly

- Symptom: repeated `rpc_probe` incidents.
- Fix: set `L1_RPC`/`L2_RPC`/`L3_RPC` in the compose environment.

