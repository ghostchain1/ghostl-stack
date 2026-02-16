# Ghost Bots (Incident DB + GST Enforcement)

This is a conservative ops helper that:

- runs runtime + chain RPC health checks (L1/L2/L3)
- runs GST policy gates (`scripts/gst-leakage-gate.sh`, `scripts/gst-symbol-gate.sh`)
- records failures as de-duplicated incidents in a local SQLite DB
- seeds ranked patch candidates (proposals only)
- stores patch verifications, approvals, and deployment audit rows
- serves a minimal local incident dashboard

Non-goals (by design):

- no auto-commits
- no destructive actions (no chain resets, no volume wipes)

## Run Once

```bash
python3 ops/ghost-bots/core/orchestrator.py --once
```

DB default: `ops/ghost-bots/db/incidents.sqlite` (ignored by git).

## Run Loop

```bash
python3 ops/ghost-bots/core/orchestrator.py --loop --interval 300
```

Loop mode also:

- updates `ops/ghost-bots/reports/daily_health.md`
- writes policy snapshots (`gst_leakage_latest.json`, `gst_symbol_latest.json`)
- checks for `ops/ghost-bots/APPROVE_NEXT_PATCH` and, when present, runs atomic approval flow

Optional env toggles for approval-loop verification runtime:

- `GHOST_BOTS_SKIP_SERVICE_TESTS=1`
- `GHOST_BOTS_SKIP_FORGE=1`
- `GHOST_BOTS_SKIP_RPC_SMOKE=1`
- `GHOST_BOTS_SKIP_COMPOSE=1`
- `GHOST_BOTS_GATE_TIMEOUT_SEC=<seconds>`
- `GHOST_BOTS_SERVICE_TEST_TIMEOUT_SEC=<seconds>`
- `GHOST_BOTS_FORGE_TIMEOUT_SEC=<seconds>`

## Dashboard

```bash
python3 ops/ghost-bots/dashboards/server.py --db ops/ghost-bots/db/incidents.sqlite --bind 127.0.0.1 --port 8088
```

Then open: `http://127.0.0.1:8088`

API endpoints:

- `GET /api/incidents`
- `GET /api/incidents/<id>`
- `GET /api/summary` (System Health + GST Compliance)

## Verify Patch Candidate

```bash
python3 ops/ghost-bots/plugins/verify_patch.py --patch-id 2
```

Timeout flags:

```bash
python3 ops/ghost-bots/plugins/verify_patch.py \
  --patch-id 2 \
  --gate-timeout-seconds 180 \
  --service-test-timeout-seconds 900 \
  --forge-timeout-seconds 900
```

Skip runtime-dependent checks (useful in CI smoke mode):

```bash
python3 ops/ghost-bots/plugins/verify_patch.py \
  --patch-id 0 \
  --skip-service-tests \
  --skip-forge \
  --skip-rpc-smoke \
  --skip-compose
```

Artifacts:

- `ops/ghost-bots/reports/verify/<patch_id>/<timestamp>/summary.json`
- gate output logs in the same directory
- rows inserted into `verifications`

## Approval Token + Atomic Commit

Create `ops/ghost-bots/APPROVE_NEXT_PATCH`:

```text
patch_id=2
note=approved for bot commit
```

Then either:

- let loop mode consume it automatically, or
- run explicitly:

```bash
python3 ops/ghost-bots/plugins/apply_patch_atomic.py
```

This flow:

- inserts an `approvals` row
- re-runs verification gates
- creates branch `gst/botfix/<incident>-<patch>-<title>`
- commits with `gst(bot): fix ... [incident:<id>] [patch:<id>]`
- inserts a `deployments` row
- deletes the approval token file on success
- blocks execution if the git worktree is dirty (to prevent accidental commits of unrelated local changes)

## Install To /opt (Optional)

```bash
bash ops/ghost-bots/install.sh
```

This copies the bot suite to `/opt/ghost-bots` without copying runtime artifacts.

To run continuously via systemd:

```bash
sudo cp /opt/ghost-bots/systemd/ghost-bots.service /etc/systemd/system/ghost-bots.service
sudo systemctl daemon-reload
sudo systemctl enable --now ghost-bots
```

The bundled unit sets timeout defaults for verification gates:

- `GHOST_BOTS_GATE_TIMEOUT_SEC=180`
- `GHOST_BOTS_SERVICE_TEST_TIMEOUT_SEC=900`
- `GHOST_BOTS_FORGE_TIMEOUT_SEC=900`

## Notes

- Docker calls go through `scripts/lib/docker.sh` (`hg_docker`) so the bots can run on hosts where the user is not in the `docker` group.
- RPC checks use `eth_*` JSON-RPC methods for compatibility; native currency branding is enforced elsewhere.
- `plugins/ingest_signal.py` can ingest external failures into the incident DB while preserving dedupe fingerprints.
