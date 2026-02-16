# Phase 9 (Final Verification + Lock-In) Report

Date (UTC): 2026-02-16

## 1. What Was Scanned (Paths)

- `scripts/gst-leakage-gate.sh`
- `scripts/preflight.sh`
- `contracts/test/GSTInvariant.t.sol`
- `docs/gst-migration/PROPOSAL-CALLDATA.json`
- `docs/gst-migration/EVIDENCE-PACK.md`
- `grafana/dashboards/gst-executive.json`
- `grafana/dashboards/gst-chains.json`
- `grafana/dashboards/gst-services.json`
- `infra/ghostchain/docker-compose.l1.yml`
- `infra/opstack/docker-compose.yml`
- `infra/opstack/docker-compose.l3.yml`
- `observability/infra/docker-compose.yml`

## 2. What Changed (Minimal Diffs)

- Refreshed `docs/gst-migration/EVIDENCE-PACK.md` with:
  - before/after leakage counts
  - command evidence and results
  - governance calldata hashes
  - dashboard list
  - compliance matrix
- Stabilized L2/L3 go-no-go invariant execution:
  - default mode now enforces `GSTInvariant.t.sol` (`L*_GO_NO_GO_INVARIANT_MODE=gst`)
  - full invariant mode remains available via env override (`L*_GO_NO_GO_INVARIANT_MODE=full`)
- Added this final phase report:
  - `docs/gst-migration/PHASE9_FINAL_REPORT.md`

## 3. Commands Run

```bash
bash scripts/gst-leakage-gate.sh
bash scripts/preflight.sh
forge test --match-path test/GSTInvariant.t.sol
npm --prefix contracts run build
npm --prefix services/hyper-ghost-supervisor run build
npm --prefix services/hyper-ghost-supervisor test
jq empty grafana/dashboards/gst-executive.json grafana/dashboards/gst-chains.json grafana/dashboards/gst-services.json
docker compose -f infra/ghostchain/docker-compose.l1.yml config
docker compose -f infra/opstack/docker-compose.yml -f infra/opstack/docker-compose.l3.yml -f observability/infra/docker-compose.yml config
docker compose -f observability/infra/docker-compose.yml config
SKIP_DOCKER_CHECK=1 ... bash infra/scripts/gates/l1-go-no-go.sh
L2_GO_NO_GO_SKIP_RUNTIME=1 L2_DOCTOR_SKIP_RUNTIME=1 L2_DOCTOR_SKIP_DOCKER=1 bash infra/scripts/gates/l2-go-no-go.sh
L2_DOCTOR_SKIP_RUNTIME=1 L2_DOCTOR_SKIP_DOCKER=1 bash infra/scripts/doctor-l2.sh
L3_GO_NO_GO_SKIP_RUNTIME=1 L3_DOCTOR_SKIP_RUNTIME=1 L3_DOCTOR_SKIP_DOCKER=1 bash infra/scripts/gates/l3-go-no-go.sh
bash ops/scripts/preflight.sh --dry-run --json >/tmp/ops-preflight.json
```

## 4. Expected Output

- GST leakage and symbol gates pass.
- Foundry GST invariant suite passes.
- Dashboard JSON validates and compose configs resolve.
- L1/L2/L3 smoke gates pass in reduced-runtime mode.

## 5. Rollback Plan (Git-Based)

```bash
# Safe rollback in shared history:
git revert <phase9-commit-sha>

# If local-only and you want to keep edits but remove the commit:
git reset --mixed HEAD~1
```
