# GhostNetSync Runbook

## Phases

0. Discovery (read-only)
1. Desired state load
2. Diff plan generation
3. Non-disruptive network add
4. VM attach/config stage
5. Docker network reconciliation (parallel)
6. Verification + evidence
7. Continuous reconciliation
8. Testnet provisioning
9. Governance gate for destructive/mainnet
10. Mainnet provisioning

## Commands

```bash
python3 ghostnetsync.py discover
python3 ghostnetsync.py plan
python3 ghostnetsync.py apply --dry-run
python3 ghostnetsync.py verify
python3 ghostnetsync.py verify --context l3
python3 ghostnetsync.py verify --context l3 --probe-source <l3-container-name>
python3 ghostnetsync.py remediate
GNS_APPLY_ENABLED=true python3 ghostnetsync.py remediate --apply
python3 ghostnetsync.py bundle-evidence
python3 ghostnetsync.py bundle-evidence --include-all --depth 20
python3 ghostnetsync.py bundle-evidence --include-all --depth 20 --output /tmp/ghost-bundles --sign
python3 ghostnetsync.py verify-bundle --bundle-dir /tmp/ghost-bundles/<timestamp>
python3 ghostnetsync.py verify-bundle --bundle-dir /tmp/ghost-bundles/<timestamp> --jsonl --strict
./scripts/ci_verify_bundle.sh /tmp/ghost-bundles/<timestamp>
python3 ghostnetsync.py rollback
python3 ghostnetsync.py status
```

`--context host` skips L3-only traffic probes.
`--context l3` enforces L3 policy probes and should be run from an L3 VM/container namespace.
`--probe-source` runs probes via `docker exec` inside that container for real L3-path checks.
When `--context l3` is used without `--probe-source`, GhostNetSync auto-selects a source by `ghost.layer=l3`, then falls back to `ghost_l3_net` membership.
If no L3 probe source is found, verification fails closed for L3 enforcement checks.
`remediate` creates a staged nftables enforcement plan with explicit rollback commands and can apply only when `GNS_APPLY_ENABLED=true`.
`bundle-evidence` packages latest plan/remediation/verification artifacts into `bundles/<timestamp>/` and a `.tar.gz` archive.
Use `--include-all` to package multiple recent runs; `--depth` controls how many timestamped plan/evidence directories are included.
Use `--output` to write bundles to a custom directory and `--sign` to include SHA256 checksums in manifest output.
`verify-bundle` validates manifest and archive checksums for signed evidence bundles.
Use `--jsonl` for CI-friendly structured lines and `--strict` for deterministic non-zero exit codes on failure.
`scripts/ci_verify_bundle.sh` wraps strict verification and emits a one-line `BUNDLE_VERIFY PASS|FAIL` summary for pipeline logs.

## GitHub Actions

- Reusable action: `.github/actions/ghostvm-ai-verify-bundle/action.yml`
- Both workflows use this shared verifier to keep JSONL parsing, summary output, and `verify_ok` behavior consistent.
- Workflow lint: `.github/workflows/ghostvm-ai-workflow-lint.yml` validates `.github/workflows/*.yml` and `.github/actions/**/action.yml` using YAML parse + `actionlint`.
- Workflow: `.github/workflows/ghostvm-ai-verify-bundle.yml`
- Trigger manually (`workflow_dispatch`) and pass `bundle_dir` as an absolute runner path containing `manifest.json`.
- Workflow: `.github/workflows/ghostvm-ai-bundle-e2e.yml`
- Trigger manually to build/sign/upload a bundle artifact, then verify it in a downstream job using strict checksum validation.
- Optional input: `pr_number` to post a verification summary comment directly on a pull request.
- The workflow includes an explicit verification policy gate step that fails the job when `verify_ok` is false.

## CI Status & Gates

| Workflow | Purpose | Trigger | Gate Behavior |
|---|---|---|---|
| `.github/workflows/ghostvm-ai-workflow-lint.yml` | Lint workflow/action YAML and CI wiring | `pull_request` on `.github/**`, `workflow_dispatch` | Fails on YAML parse or `actionlint` errors |
| `.github/workflows/ghostvm-ai-verify-bundle.yml` | Verify an existing bundle directory | `workflow_dispatch` | Fails when bundle verify policy gate fails (`verify_ok != true`) |
| `.github/workflows/ghostvm-ai-bundle-e2e.yml` | Build/sign bundle, transfer artifact, verify | `workflow_dispatch` | Fails when downstream verification policy gate fails (`verify_ok != true`) |

Expected reviewer signal:

- `workflow-lint` green: CI definitions are syntactically and semantically valid.
- `verify-bundle` green: provided bundle integrity passes checksum verification.
- `bundle-e2e` green: end-to-end bundle generation and verification path is intact.

## Release Checklist

1. **Local test gate**
	- Run: `cd services/ghostvm-ai && PYTHONPATH=. pytest -q -ra`
	- Required: all tests pass.

2. **Generate signed evidence bundle**
	- Run: `python3 ghostnetsync.py bundle-evidence --include-all --depth 20 --output /tmp/ghostvm-ai-bundles --sign`
	- Required: output includes `signing.archive_sha256` and `signing.manifest_sha256`.

3. **Local strict verification gate**
	- Run: `python3 ghostnetsync.py verify-bundle --bundle-dir /tmp/ghostvm-ai-bundles/<timestamp> --jsonl --strict`
	- Required: exit code `0` and all checks `ok=true`.

4. **CI lint gate**
	- Trigger/observe: `.github/workflows/ghostvm-ai-workflow-lint.yml`
	- Required: workflow succeeds.

5. **CI bundle verification gate**
	- Trigger: `.github/workflows/ghostvm-ai-verify-bundle.yml` with `bundle_dir`
	- Required: workflow succeeds and policy gate does not fail.

6. **CI end-to-end gate**
	- Trigger: `.github/workflows/ghostvm-ai-bundle-e2e.yml`
	- Optional: set `pr_number` for verification summary comment.
	- Required: build, verify, and explicit policy gate all succeed.

7. **Rollback readiness checkpoint**
	- Confirm latest remediation plan contains rollback command:
	  - `sudo nft -f /tmp/ghostnetsync-ruleset-pre-remediation.nft`
	- Confirm file exists before release operations that apply nftables changes.

Automated helper:

- Run: `./scripts/release_checklist.sh`
- Optional output directory: `./scripts/release_checklist.sh /tmp/ghostvm-ai-bundles`
- Optional PR comment: `./scripts/release_checklist.sh /tmp/ghostvm-ai-bundles --pr-comment 61`
- Optional PR comment preview only: `./scripts/release_checklist.sh /tmp/ghostvm-ai-bundles --pr-comment 61 --dry-run`
- Optional skip tests: `./scripts/release_checklist.sh /tmp/ghostvm-ai-bundles --no-tests`
- Optional skip bundle build (verify existing bundle only): `./scripts/release_checklist.sh --no-bundle --bundle-dir /tmp/ghostvm-ai-bundles/<timestamp>`
- Optional machine-readable summary: `./scripts/release_checklist.sh /tmp/ghostvm-ai-bundles --json`
- Behavior: runs steps 1–3 (tests, signed bundle, strict verify) and prints `RELEASE_CHECKLIST PASS` on success.
- PR comment mode requires `gh` CLI and `GITHUB_TOKEN`.
- `--no-bundle` requires `--bundle-dir`; strict verification remains mandatory.

## Governance lock

Destructive actions require approval files in:

`governance/approvals/<action-id>.json`

Required fields:

- `action`
- `scope`
- `timestamp_window`
- `signatures`
- `plan_hash`
