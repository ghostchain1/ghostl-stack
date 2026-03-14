# GST Ops Bots Phase 0-2 Report

Date: 2026-02-16 (UTC)
Repo: `/home/ghost/ghostl-stack`
Branch: `brand/gst-native`

## Phase 0: Bootstrap + Baseline

### What was scanned
- `ops/ghost-bots/**`
- `docs/gst-migration/**`
- `scripts/**`

### What changed
- Reused existing bot suite under `ops/ghost-bots/` (already present in repo).
- Added Phase 1/2 deltas:
  - `ops/ghost-bots/plugins/ingest_signal.py`
  - `ops/ghost-bots/dashboards/server.py` (`/api/summary`)
  - `ops/ghost-bots/dashboards/incidents.html` (System Health + GST Compliance views)
  - `ops/ghost-bots/plugins/research_official.py` (timezone-aware UTC date)
  - `ops/ghost-bots/README.md` (API endpoints + ingest plugin note)

### Commands run
```bash
python3 -m py_compile ops/ghost-bots/core/*.py ops/ghost-bots/plugins/*.py ops/ghost-bots/dashboards/server.py
```

### Expected output
- No output (successful compile).

### Rollback plan
- `git restore -- ops/ghost-bots/README.md ops/ghost-bots/dashboards/incidents.html ops/ghost-bots/dashboards/server.py ops/ghost-bots/plugins/research_official.py ops/ghost-bots/plugins/ingest_signal.py docs/gst-migration/BOTS-PHASE0-2-REPORT.md`

## Phase 1: Incident DB + Ingestion

### DB schema path
- `ops/ghost-bots/db/schema.sql`

### Runtime DB path
- `ops/ghost-bots/db/incidents.sqlite`

### Commands run
```bash
python3 ops/ghost-bots/core/orchestrator.py --once
python3 ops/ghost-bots/plugins/ingest_signal.py \
  --kind sample_signal \
  --title "Sample incident for dashboard" \
  --summary "manual ingest sample" \
  --subsystem policy \
  --service repo \
  --source manual \
  --payload-json '{"note":"sample"}'
sqlite3 ops/ghost-bots/db/incidents.sqlite '.tables'
```

### Expected output
- `orchestrator.py` writes `ops/ghost-bots/reports/last_run.json`.
- `ingest_signal.py` prints a JSON object with `incident_id` and `fingerprint`.
- SQLite tables include:
  - `incidents`, `signals`, `patches`, `verifications`, `approvals`, `deployments`.

### Example incident inserted
```text
incident_id=3
title=Sample incident for dashboard
severity=low
status=open
```

### Example ranked patch candidates
```text
incident_id=1 rank=85 patch_type=tighten_allowlist
incident_id=1 rank=65 patch_type=fix_gst_leakage
incident_id=2 rank=85 patch_type=triage_only
```

### Rollback plan
- Remove the sample incident only:
```bash
sqlite3 ops/ghost-bots/db/incidents.sqlite "DELETE FROM incidents WHERE id=3;"
```
- Or remove runtime DB and recreate on next run:
```bash
rm -f ops/ghost-bots/db/incidents.sqlite
python3 ops/ghost-bots/core/orchestrator.py --once
```

## Phase 2: Local Dashboard + API

### Dashboard URL
- `http://127.0.0.1:8088`

### Commands run
```bash
python3 ops/ghost-bots/dashboards/server.py \
  --db ops/ghost-bots/db/incidents.sqlite \
  --bind 127.0.0.1 \
  --port 8088
```

### Screenshot instructions
1. Start the dashboard server command above.
2. Open a browser on the VM and visit `http://127.0.0.1:8088`.
3. Capture the page showing:
   - System Health
   - GST Compliance
   - Open Incidents
   - Incident Detail

### API checks
```bash
curl -sS http://127.0.0.1:8088/api/summary | jq .
curl -sS http://127.0.0.1:8088/api/incidents | jq .
curl -sS http://127.0.0.1:8088/api/incidents/2 | jq .
```

### Expected output
- `/api/summary` returns docker/rpc health and GST gate status.
- `/api/incidents` returns open incidents.
- `/api/incidents/<id>` returns incident details with signals and patch candidates.

### Example research cache entry (official docs only)
Commands:
```bash
python3 ops/ghost-bots/plugins/research_official.py https://docs.optimism.io/
python3 ops/ghost-bots/plugins/research_official.py https://getfoundry.sh/introduction/installation/
python3 ops/ghost-bots/plugins/research_official.py https://geth.ethereum.org/docs
```

Cache files:
- `ops/ghost-bots/cache/docs.optimism.io/2026-02-16/639471b138623a05.txt`
- `ops/ghost-bots/cache/getfoundry.sh/2026-02-16/e022726778852605.txt`
- `ops/ghost-bots/cache/geth.ethereum.org/2026-02-16/2e565fb796ce76f3.txt`

Allowlist enforcement example:
```bash
python3 ops/ghost-bots/plugins/research_official.py https://example.com
```
- Expected: policy violation (`host not in allowlist`).
