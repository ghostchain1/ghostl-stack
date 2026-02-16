# GST Ops Bots Phase 3-10 Report

Date: 2026-02-16 (UTC)  
Repo: `/home/ghost/ghostl-stack`  
Branch: `brand/gst-native`

## Phase 3 - Patch Ranking Engine

1. What was scanned
- `ops/ghost-bots/plugins/patchsmith.py`
- `ops/ghost-bots/core/ranker.py`

2. What changed
- Expanded candidate generation in `ops/ghost-bots/plugins/patchsmith.py`:
  - `p1_scoped_identifier_rename`
  - `p2_env_compat_shim`
  - `p3_db_expand_backfill_switch`
  - `p4_ui_label_correction`
  - `p5_metrics_dashboard_alignment`
  - `p6_opstack_config_alignment`
  - `triage_only` and `tighten_allowlist`

3. Commands to run
```bash
python3 ops/ghost-bots/core/orchestrator.py --once
sqlite3 ops/ghost-bots/db/incidents.sqlite \
  "select id,incident_id,rank_score,patch_type,status from patches order by id desc limit 20;"
```

4. Expected output
- Patch rows are created and scored with `rank_score` in `patches`.

5. Rollback plan
```bash
git revert <phase3_commit_sha>
```

## Phase 4 - Controlled Official Research

1. What was scanned
- `ops/ghost-bots/core/policy.py`
- `ops/ghost-bots/plugins/research_official.py`

2. What changed
- Kept strict allowlist-only research domains.
- Updated UTC date handling to timezone-aware timestamps.

3. Commands to run
```bash
python3 ops/ghost-bots/plugins/research_official.py https://docs.optimism.io/
python3 ops/ghost-bots/plugins/research_official.py https://geth.ethereum.org/docs
python3 ops/ghost-bots/plugins/research_official.py https://getfoundry.sh/introduction/installation/
```

4. Expected output
- Cache files under `ops/ghost-bots/cache/<host>/<date>/<hash>.txt`.
- Non-allowlisted host fails with policy violation.

5. Rollback plan
```bash
git revert <phase4_commit_sha>
```

## Phase 5 - Enforcement Gate Reporting

1. What was scanned
- `ops/ghost-bots/core/orchestrator.py`
- `scripts/gst-leakage-gate.sh`
- `scripts/gst-symbol-gate.sh`

2. What changed
- Added gate snapshot outputs in orchestrator:
  - `ops/ghost-bots/reports/gst_leakage_latest.json`
  - `ops/ghost-bots/reports/gst_symbol_latest.json`

3. Commands to run
```bash
python3 ops/ghost-bots/core/orchestrator.py --once
cat ops/ghost-bots/reports/gst_leakage_latest.json
cat ops/ghost-bots/reports/gst_symbol_latest.json
```

4. Expected output
- JSON gate snapshots with `ok`, `summary`, and payload details.

5. Rollback plan
```bash
git revert <phase5_commit_sha>
```

## Phase 6 - L1/L2/L3 Health Gates

1. What was scanned
- `ops/ghost-bots/plugins/sentinel.py`
- `ops/ghost-bots/core/orchestrator.py`

2. What changed
- Existing L1/L2/L3 RPC checks retained and reported in run output + dashboard summary.

3. Commands to run
```bash
python3 ops/ghost-bots/core/orchestrator.py --once
jq -r '.checks[] | [.kind,.ok,.title,.summary] | @tsv' ops/ghost-bots/reports/last_run.json
```

4. Expected output
- `rpc_health` checks for L1/L2/L3 present with chain ids and block heights.

5. Rollback plan
```bash
git revert <phase6_commit_sha>
```

## Phase 7 - Verification Pipeline Per Patch

1. What was scanned
- `ops/ghost-bots/db/schema.sql`
- `ops/ghost-bots/core/db.py`

2. What changed
- Added verification pipeline:
  - `ops/ghost-bots/plugins/verify_patch.py`
  - `ops/ghost-bots/plugins/verify_patch.sh`
- Added DB helpers in `ops/ghost-bots/core/db.py`:
  - `insert_verification`, `update_patch_status`, `get_patch`

3. Commands to run
```bash
python3 ops/ghost-bots/plugins/verify_patch.py --patch-id 2 --skip-service-tests --skip-forge
sqlite3 ops/ghost-bots/db/incidents.sqlite \
  "select patch_id,gate_name,ok,ts from verifications where patch_id=2 order by id desc limit 20;"
```

4. Expected output
- Artifacts at `ops/ghost-bots/reports/verify/<patch_id>/<timestamp>/`.
- Verification rows inserted in `verifications`.
- Patch status updated to `verified_passed` or `verified_failed`.

5. Rollback plan
```bash
git revert <phase7_commit_sha>
```

## Phase 8 - Approval Token + Atomic Commit Flow

1. What was scanned
- `ops/ghost-bots/core/orchestrator.py`
- `ops/ghost-bots/plugins/apply_patch_atomic.py`

2. What changed
- Added approval/commit plugin: `ops/ghost-bots/plugins/apply_patch_atomic.py`
- Added DB helpers in `ops/ghost-bots/core/db.py`:
  - `insert_approval`, `insert_deployment`
- Added token archival on failed approval attempts:
  - `APPROVE_NEXT_PATCH` -> `APPROVE_NEXT_PATCH.failed`
- Orchestrator loop integration:
  - consumes approval token if present
  - optional env controls:
    - `GHOST_BOTS_SKIP_SERVICE_TESTS=1`
    - `GHOST_BOTS_SKIP_FORGE=1`

3. Commands to run
```bash
cat > ops/ghost-bots/APPROVE_NEXT_PATCH <<'EOF'
patch_id=2
note=approval test
EOF
python3 ops/ghost-bots/plugins/apply_patch_atomic.py --skip-service-tests --skip-forge
sqlite3 ops/ghost-bots/db/incidents.sqlite \
  "select id,patch_id,approver,decision,note from approvals order by id desc limit 5;"
sqlite3 ops/ghost-bots/db/incidents.sqlite \
  "select id,patch_id,method,ok,notes from deployments order by id desc limit 5;"
```

4. Expected output
- `approvals` row inserted.
- Verification re-run happens before commit.
- On failure, deployment row inserted with `ok=0` and token archived to `.failed`.

5. Rollback plan
```bash
git revert <phase8_commit_sha>
```

## Phase 9 - Continuous Maintenance Loop + Daily Report

1. What was scanned
- `ops/ghost-bots/core/orchestrator.py`
- `ops/ghost-bots/systemd/ghost-bots.service`

2. What changed
- Added daily report plugin: `ops/ghost-bots/plugins/daily_report.py`
- Orchestrator now writes:
  - `ops/ghost-bots/reports/daily_health.md`
  - `ops/ghost-bots/reports/last_run.json`
  - `ops/ghost-bots/reports/incident_export.json`

3. Commands to run
```bash
python3 ops/ghost-bots/core/orchestrator.py --once
sed -n '1,120p' ops/ghost-bots/reports/daily_health.md
```

4. Expected output
- Daily markdown health snapshot including open incidents and latest checks.

5. Rollback plan
```bash
git revert <phase9_commit_sha>
```

## Phase 10 - Deliverables Status

- SQLite incident DB + ingestion: complete
  - `ops/ghost-bots/db/schema.sql`
  - `ops/ghost-bots/plugins/ingest_signal.py`
- Local dashboard + API: complete
  - `ops/ghost-bots/dashboards/server.py`
  - `ops/ghost-bots/dashboards/incidents.html`
- Patch ranking engine: complete
  - `ops/ghost-bots/plugins/patchsmith.py`
- Controlled official-doc research plugin: complete
  - `ops/ghost-bots/plugins/research_official.py`
- GST leakage enforcement reporting: complete
  - `ops/ghost-bots/reports/gst_leakage_latest.json`
- L1/L2/L3 health gates: complete
  - `ops/ghost-bots/plugins/sentinel.py`
- Verification pipeline with artifacts: complete
  - `ops/ghost-bots/plugins/verify_patch.py`
  - `ops/ghost-bots/reports/verify/**`
- Approval token flow + atomic commit scaffold: complete
  - `ops/ghost-bots/plugins/apply_patch_atomic.py`
- Continuous loop + daily report: complete
  - `ops/ghost-bots/plugins/daily_report.py`
  - `ops/ghost-bots/systemd/ghost-bots.service`
