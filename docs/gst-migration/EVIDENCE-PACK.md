# GST-Native Evidence Pack

Generated (UTC): `2026-02-15T04:49:27Z`
Tested git ref: `(worktree)`

This document summarizes **what we can verify in this harness** and the key artifacts produced for the GST-native migration.

## Verified in this environment

- Branding leakage gate (GST-native):
  - `npm run gst:leakage` → **OK**
- Legacy symbol gate (GST-native):
  - `npm run gst:symbol` → **OK**
- Slither (formal):
  - `npm --prefix contracts run formal:slither` → **OK** (uses `sudo -n docker` fallback when needed)
- Echidna (formal):
  - `npm --prefix contracts run formal:echidna` → **OK**
- Scribble (formal):
  - `npm --prefix contracts run formal:scribble` → **OK**
- Governance proposal calldata (deterministic):
  - `npm --prefix contracts run proposal:gst-constitution` → **OK**
  - Artifact: `docs/gst-migration/PROPOSAL-CALLDATA.json`
- Foundry GST invariant regression test:
  - `cd contracts && forge test --match-path test/GSTInvariant.t.sol` → **OK**
- L1/L2/L3 gates (dry-run where required):
  - `bash ops/scripts/preflight.sh --dry-run --json` → **OK** (notes: compose overlay warning for `docker-compose.phase3.secrets.yml`)
  - `SKIP_DOCKER_CHECK=1 ... bash infra/scripts/gates/l1-go-no-go.sh` → **OK** (docker socket blocked → doctor SKIPPED)
  - `L2_GO_NO_GO_SKIP_RUNTIME=1 ... bash infra/scripts/gates/l2-go-no-go.sh` → **OK** (docker socket blocked → doctor SKIPPED)
  - `L3_GO_NO_GO_SKIP_RUNTIME=1 ... bash infra/scripts/gates/l3-go-no-go.sh` → **OK** (docker socket blocked → doctor SKIPPED)
  - `bash infra/scripts/gates/ai-go-no-go.sh` → **OK**
- Grafana dashboard JSON parses:
  - `jq -e . observability/infra/grafana/dashboards/opstack-observability.json` → **OK**

## Known harness limitations / skips

- Docker Engine is not usable as the current user; scripts that support `sudo -n docker` can still run docker-based checks.
- No live L1/L2/L3 RPCs are assumed running, so runtime checks are skipped in dry-run modes.

## Enforcement policy artifacts

- Leakage gate script: `scripts/gst-leakage-gate.sh`
- Symbol gate script: `scripts/gst-symbol-gate.sh`
- Allowlist (must remain small/justified): `config/gst-allowlist.txt`
- Notes:
  - Gate includes first-party generated artifacts (e.g., `ops/preflight/**`, `ops/snapshots/**`) and permits Hyperledger Besu’s technical `--rpc-http-api=ETH,...` module token.

## Attestation checklist

See: `docs/gst-migration/PHASE6_ATTESTATION.md`
