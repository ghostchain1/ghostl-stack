# Ghost Bots (Incident DB + GST Enforcement)

This is a conservative ops helper that:

- runs runtime + chain RPC health checks (L1/L2/L3)
- runs GST policy gates (`scripts/gst-leakage-gate.sh`, `scripts/gst-symbol-gate.sh`)
- records failures as de-duplicated incidents in a local SQLite DB
- seeds ranked patch candidates (proposals only)
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

## Dashboard

```bash
python3 ops/ghost-bots/dashboards/server.py --db ops/ghost-bots/db/incidents.sqlite --bind 127.0.0.1 --port 8088
```

Then open: `http://127.0.0.1:8088`

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

## Notes

- Docker calls go through `scripts/lib/docker.sh` (`hg_docker`) so the bots can run on hosts where the user is not in the `docker` group.
- RPC checks use `eth_*` JSON-RPC methods for compatibility; native currency branding is enforced elsewhere.
