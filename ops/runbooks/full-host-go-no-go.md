# Full-host Go/No-Go Runbook (no skips)

Purpose: re-run Phase 6 go/no-go gates on a real host with **working Docker** and **reachable RPC endpoints**, with **no skip flags**, to obtain a production-grade decision.

This repo can run “dry-run” gates in restricted harnesses, but that does **not** validate runtime behavior. Use this runbook to validate runtime + docker isolation.

## Preconditions

- Linux host (or VM) with:
  - Docker Engine + Docker Compose v2 (`docker compose version`)
  - `bash`, `jq`, `zip`, `sha256sum`
- Tooling:
  - Foundry (`forge --version`) available on PATH (or set `FORGE_BIN`)
  - Node.js + npm for contracts scripts (`node --version`, `npm --version`)
  - Trivy installed (`trivy --version`)
- Network egress allowed for:
  - Trivy vulnerability DB updates (unless you explicitly manage an internal mirror)
  - Any external RPC endpoints you configure for interchain tests
- Secrets provisioned (do **not** commit them):
  - See `infra/docker/secrets.example/README.md`

## Recommended hygiene

- Work from a clean commit and clean tree:
  - `git checkout <sha>`
  - `git status` should be empty
- Confirm no dev secrets:
  - Do **not** set `ALLOW_DEV_SECRETS=1` on production hosts.
  - Use Vault / your secrets manager.

## Run gates (no skips)

From repo root:

1) L1 gate:
   - `bash infra/scripts/gates/l1-go-no-go.sh`

2) L2 gate:
   - `bash infra/scripts/gates/l2-go-no-go.sh`

3) L3 gate:
   - `bash infra/scripts/gates/l3-go-no-go.sh`

4) AI governance gate:
   - `bash infra/scripts/gates/ai-go-no-go.sh`

Expected:

- All scripts exit `0`.
- Evidence packs land in `infra/evidence/out/` and each has a `.sha256`.
- `provenance/provenance.json` inside each evidence pack records:
  - the git commit
  - `dirty: false`

## Post-run checks

- Verify evidence pack hashes:
  - `sha256sum infra/evidence/out/evidence-pack-*.zip | sort`
- Confirm invariants summary:
  - `cat contracts/reports/foundry/summary.json`
- Confirm Slither summary:
  - `cat contracts/reports/formal/summary.json`
- Confirm Trivy report:
  - `ls -lah ops/security/trivy-fs.json`

## Failure handling

- If a gate fails, do not override it. Capture:
  - the full logs
  - the evidence packs present (even partial)
  - `git rev-parse HEAD` and `git status`
- Fix, then re-run **all** gates to avoid partial “green” states.

