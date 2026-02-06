# GST-Native Evidence Pack

Generated (UTC): `2026-02-06T11:36:16Z`
Tested git SHA: `55a7edcf355bb68dbacb2e7f2d262c65a38c2662`

This document summarizes **what we can verify in this harness** and the key artifacts produced for the GST-native migration.

## Verified in this environment

- Branding leakage gate (GST-native):
  - `npm run gst:leakage` → **OK**
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

- Docker daemon/socket access is blocked; docker-based scans (e.g., Slither container runs) SKIP outside strict mode.
- No live L1/L2/L3 RPCs are assumed running, so runtime checks are skipped in dry-run modes.

## Enforcement policy artifacts

- Leakage gate script: `scripts/gst-leakage-gate.sh`
- Allowlist (must remain small/justified): `config/gst-allowlist.txt`
- Notes:
  - Gate includes first-party generated artifacts (e.g., `ops/preflight/**`, `ops/snapshots/**`) and permits Hyperledger Besu’s technical `--rpc-http-api=ETH,...` module token.

## Attestation checklist

See: `docs/gst-migration/PHASE6_ATTESTATION.md`
