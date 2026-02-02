# Phase 4 — Hardening, Chaos, and Safety Locks

## Scope
- Services: network-manager-service, consensus-telemetry-service
- Focus: hardening, chaos testing scripts, rollback tooling, provenance records, CI smoke gate

## Hardening Changes
1) Non-root containers
   - Both services run as UID/GID 1000:1000.
   - Dockerfiles assign ownership to `node` and switch to `USER node`.
   - If Docker socket actions are needed, set `DOCKER_GROUP_ID` to match `/var/run/docker.sock`.

2) Read-only root filesystem
   - Compose uses `read_only: true` + `tmpfs: /tmp`.
   - Writable paths limited to `/data` (bind mount).

3) Security options
   - `cap_drop: [ALL]`
   - `security_opt: [no-new-privileges:true]`

4) Prod safety lock
   - `AUTONOMY_PROD_LOCK=true` blocks all execute actions when `NET_ENV=prod`.

## Chaos Scripts
Path: `infra/scripts/chaos/opstack-chaos.sh`

Actions:
- `disconnect-l1`: stop `l1-rpc-proxy` (simulate L1 RPC loss)
- `pause-proposer`: stop `op-proposer` temporarily
- `lag-batcher`: pause `op-batcher` temporarily
- `restore`: restore services

Example:
```bash
bash infra/scripts/chaos/opstack-chaos.sh pause-proposer 90
```

## Rollback Snapshots
Path: `scripts/rollback-consensus-autonomy.sh`

Usage:
```bash
bash scripts/rollback-consensus-autonomy.sh backup
bash scripts/rollback-consensus-autonomy.sh list
bash scripts/rollback-consensus-autonomy.sh restore <snapshot_dir>
```

Snapshots include:
- `services/network-manager-service/data`
- `services/consensus-telemetry-service/data`

## Build Provenance
Path: `scripts/build-consensus-autonomy-image.sh`

Produces a provenance JSON for the autonomy service image:
```bash
bash scripts/build-consensus-autonomy-image.sh
```

Output: `ops/reports/provenance/network-manager-service-*.json`

## CI Smoke Gate
CI runs `scripts/smoke/consensus-autonomy.sh`, enforcing:
- JS syntax checks
- consensus-telemetry unit tests
