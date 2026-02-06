# Phase 6 Attestation (Harness / Dry-Run)

Generated (UTC): `2026-02-06T11:04:58Z`
Tested git SHA: `7486dd2c240958719a0d828bb07dc38ce1d81c3c`

This attestation captures **what can be verified inside this Codex harness** (where some runtime capabilities are restricted). It is intended to be reproducible from a single git checkout.

## Environment constraints observed

- Docker Engine **socket/API access is blocked** from this harness (`docker info` / `docker version` return permission errors).
  - Result: docker-dependent checks are **SKIPPED** outside CI.
  - In CI / strict mode (`CI=1` or `SLITHER_STRICT=1`), these checks are expected to **FAIL hard** with an error summary.
- No live L1/L2/L3 RPC endpoints are assumed to be running in this harness.

## Gates executed (dry-run / best-effort)

### Preflight (dry-run)

- Command:
  - `bash ops/scripts/preflight.sh --dry-run --json`
- Outcome: **OK**
- Notes:
  - Confirms required binaries are present and required env files exist.
  - Skips docker runtime capture and RPC reachability checks due to `--dry-run`.
  - Compose validation warning: `docker-compose.phase3.secrets.yml` is invalid (`ghost-relayer` has no image/build).

### L1 go/no-go (dry-run via skip flags)

- Command:
  - `SKIP_DOCKER_CHECK=1 SKIP_RPC_LOAD=1 SKIP_RESTART_CHECK=1 SKIP_MONITORING=1 SKIP_AI_MONITOR=1 SKIP_POLICY_REGISTRY=1 SKIP_INVARIANTS=1 SKIP_EVIDENCE=1 SKIP_VULN_SCAN=1 bash infra/scripts/gates/l1-go-no-go.sh`
- Outcome: **OK**
- Notes:
  - `infra/scripts/doctor-l1.sh` reports **SKIPPED** due to docker socket restrictions.

### L2 go/no-go (skip runtime)

- Command:
  - `L2_GO_NO_GO_SKIP_RUNTIME=1 L2_GO_NO_GO_LOAD_SECONDS=0 bash infra/scripts/gates/l2-go-no-go.sh`
- Outcome: **OK**
- Notes:
  - `infra/scripts/doctor-l2.sh` reports **SKIPPED** due to docker socket restrictions.
  - Invariant tests may still be skipped if Foundry/forge is unavailable.

### L3 go/no-go (skip runtime)

- Command:
  - `L3_GO_NO_GO_SKIP_RUNTIME=1 L3_GO_NO_GO_LOAD_SECONDS=0 bash infra/scripts/gates/l3-go-no-go.sh`
- Outcome: **OK**
- Notes:
  - `infra/scripts/doctor-l3.sh` reports **SKIPPED** due to docker socket restrictions.

### Slither (formal)

- Command:
  - `npm --prefix contracts run formal:slither`
- Outcome: **SKIPPED**
- Notes:
  - Skips outside CI when docker is blocked; strict mode fails and writes `contracts/reports/formal/summary.json`.

### AI governance go/no-go

- Command:
  - `bash infra/scripts/gates/ai-go-no-go.sh`
- Outcome: **OK**
- Notes:
  - Runs federation and failure-mode smoke checks plus Foundry invariant tests.

## Not verified in this harness

- Live RPC stability, restart resilience, and monitoring target checks against running L1/L2/L3.
- Trivy vulnerability scanning.
- Full formal pipelines (Slither JSON findings, Echidna, Scribble) when Docker is required but blocked.

## Reproduce

From the repo root on a machine with full runtime access:

1. Preflight (dry-run):
   - `bash ops/scripts/preflight.sh --dry-run --json`
2. L1/L2/L3 go-no-go (dry-run):
   - Use the commands above.
3. Strict mode (CI-like):
   - `CI=1 bash ops/scripts/preflight.sh --json`
   - `SLITHER_STRICT=1 npm --prefix contracts run formal:slither`
