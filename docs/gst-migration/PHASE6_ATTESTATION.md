# Phase 6 Attestation (Harness / Dry-Run)

Generated (UTC): `2026-02-06T13:07:10Z`
Tested git SHA: `git rev-parse HEAD` (at time of run)

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
- Outcome: **OK**
- Notes:
  - `SLITHER_RUNNER=auto` prefers Docker but will fall back to a local `slither` binary if Docker is unavailable.
  - Strict mode (`CI=1` or `SLITHER_STRICT=1`) still fails hard when Slither cannot run and writes `contracts/reports/formal/summary.json`.

### GST leakage gate

- Command:
  - `npm run gst:leakage`
- Outcome: **OK**
- Notes:
  - Enforces no user-facing legacy ETH/Ethereum/Ether/ENS `.eth` leakage outside an allowlist.
  - Includes first-party generated artifacts (e.g., `ops/preflight/**`, `ops/snapshots/**`) and permits Hyperledger Besu’s technical `--rpc-http-api=ETH,...` module token.

### GST constitution proposal calldata

- Command:
  - `npm --prefix contracts run proposal:gst-constitution`
- Outcome: **OK**
- Notes:
  - Generates deterministic calldata evidence at `docs/gst-migration/PROPOSAL-CALLDATA.json`.

### GST invariant test

- Command:
  - `cd contracts && forge test --match-path test/GSTInvariant.t.sol`
- Outcome: **OK**
- Notes:
  - Ensures canonical token metadata stays locked and checks a small set of front-door config/docs for forbidden branding.

### AI governance go/no-go

- Command:
  - `bash infra/scripts/gates/ai-go-no-go.sh`
- Outcome: **OK**
- Notes:
  - Runs federation and failure-mode smoke checks plus Foundry invariant tests.

## Not verified in this harness

- Live RPC stability, restart resilience, and monitoring target checks against running L1/L2/L3.
- Trivy vulnerability scanning.
- Full formal pipelines (Echidna, Scribble) when Docker is required but blocked.

## Reproduce

From the repo root on a machine with full runtime access:

1. Preflight (dry-run):
   - `bash ops/scripts/preflight.sh --dry-run --json`
2. L1/L2/L3 go-no-go (dry-run):
   - Use the commands above.
3. Strict mode (CI-like):
   - `CI=1 bash ops/scripts/preflight.sh --json`
   - `SLITHER_STRICT=1 npm --prefix contracts run formal:slither`
