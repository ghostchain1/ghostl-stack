# Checklist: What You Can Run Today

Last updated: 2026-02-04

This checklist is **safe by default** (no transactions) unless a step is explicitly marked **RUN (submits txs)**.

**Never paste or print secrets.** Do not `cat` `.env` / `.env.secrets` files and never echo private keys. If a step requires secrets, it lists **variable names only**.

## 1) Preconditions

- [ ] **Confirm you’re in the repo root and (optionally) clean**
  - **Purpose:** Avoid running scripts from the wrong directory; `ai-go-no-go.sh` fails on an unexpected dirty tree.
  - **Command:**
    ```bash
    pwd
    git rev-parse --show-toplevel
    git status --porcelain
    ```
  - **Pass:** `--show-toplevel` ends in `ghostl-stack`; `git status --porcelain` is empty (recommended).
  - **Likely fails:** Not in repo; local changes from previous runs (e.g., editing `services/stack.env`).
  - **Debug:**
    ```bash
    git status
    git diff --name-only
    ```

- [ ] **Verify required binaries**
  - **Purpose:** Doctor + gate scripts rely on common CLI tools.
  - **Command:**
    ```bash
    for b in bash docker curl jq python3 sha256sum zip node npm; do
      command -v "$b" >/dev/null || echo "MISSING: $b"
    done
    docker compose version
    command -v trivy >/dev/null && trivy --version || echo "OPTIONAL: trivy not found"
    ```
  - **Pass:** No `MISSING:` lines; `docker compose version` prints a version. Trivy is optional unless you run Trivy-backed gates/scans.
  - **Likely fails:** Docker daemon not running; `jq` missing (bridge demos use it); Trivy missing (L1 go/no-go uses it unless explicitly skipped).
  - **Debug:**
    ```bash
    docker info
    docker compose ls
    ```

- [ ] **One-command (SAFE / dry-run)**
  - **Purpose:** Run the safe checks end-to-end (doctors → gates → AI gate → bridge dry-runs).
  - **Command (local/dev; requires your local env files are present; does NOT submit txs):**
    ```bash
    set -euo pipefail

    export ALLOW_DEV_SECRETS=1

    bash infra/scripts/doctor-l1.sh
    bash infra/scripts/doctor-l2.sh
    bash infra/scripts/doctor-l3.sh

    bash infra/scripts/gates/l1-go-no-go.sh
    bash infra/scripts/gates/l2-go-no-go.sh
    bash infra/scripts/gates/l3-go-no-go.sh
    bash infra/scripts/gates/ai-go-no-go.sh

    bash infra/scripts/bridge-e2e.sh --mode l1l2
    bash infra/scripts/bridge-e2e.sh --mode l2l3
    ```
  - **Pass:** All scripts exit `0` and print their `OK`/`passed` lines.
  - **Likely fails:** Dev secrets blocked (set `ALLOW_DEV_SECRETS=1`); missing local `.env.secrets` content; Trivy missing for L1 gate.
  - **Debug:**
    ```bash
    bash infra/scripts/doctor-l1.sh || true
    bash infra/scripts/doctor-l2.sh || true
    bash infra/scripts/doctor-l3.sh || true
    ```

- [ ] **One-command (RUN FOR REAL; SUBMITS TXS)**
  - **Purpose:** Execute bridge E2E flows (this will submit transactions).
  - **Command:**
    ```bash
    set -euo pipefail

    # L1<->L2 ERC20 bridge deposit + withdraw (submits txs)
    bash infra/scripts/bridge-e2e.sh --mode l1l2 --run --amount 1

    # L2<->L3 ERC20 bridge deposit + relay + withdraw (submits txs; requires relayer not observe-only)
    bash infra/scripts/bridge-e2e.sh --mode l2l3 --run --amount 1
    ```
  - **Pass:** Scripts exit `0` and print `Bridge E2E complete`; relayer reports the expected nonce/amount.
  - **Likely fails:** Relayer is observe-only; missing bridge env files; RPC endpoints not reachable.
  - **Debug:**
    ```bash
    curl -fsS http://localhost:7171/health | jq .
    bash infra/scripts/doctor.sh
    ```

## 2) L1/L2/L3 “is up” checks: `doctor-l1.sh`, `doctor-l2.sh`, `doctor-l3.sh`

### L1 “is up”: `infra/scripts/doctor-l1.sh`

- [ ] **L1 doctor (local/dev secrets)**
  - **Purpose:** Validate Docker/compose, config checksums, L1 RPC health, and L1 metrics + Prometheus target.
  - **Command:**
    ```bash
    ALLOW_DEV_SECRETS=1 bash infra/scripts/doctor-l1.sh
    ```
  - **Pass:** Ends with `[doctor-l1] OK`; metrics and RPC checks are `OK`.
  - **Likely fails:** `Dev secrets blocked`; RPC not reachable (`HOST_L1_RPC`); metrics not reachable (`L1_METRICS_PROM_URL`); genesis/run-script checksum mismatch.
  - **Debug:**
    ```bash
    docker compose -f infra/ghostchain/docker-compose.eth.yml ps
    ss -lnt | rg ':18545|:18660' || true
    curl -fsS http://localhost:18545 -H 'content-type: application/json' \
      -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'
    curl -fsS http://localhost:18660/debug/metrics/prometheus | head -n 5
    ```

- [ ] **L1 doctor (staging/prod Vault secrets)**
  - **Purpose:** Same as above, but fails closed unless Vault auth + secret files are present.
  - **Requires (names only):** `L1_SECRETS_SOURCE=vault` and Vault auth via `VAULT_ADDR` + (`VAULT_TOKEN` or `VAULT_ROLE_ID` + `VAULT_SECRET_ID`).
  - **Command:**
    ```bash
    L1_SECRETS_SOURCE=vault bash infra/scripts/doctor-l1.sh
    ```
  - **Pass:** Includes `OK: Vault secrets present` and ends with `[doctor-l1] OK`.
  - **Likely fails:** Vault auth missing; expected secret files missing under `L1_SECRETS_DIR`.
  - **Debug:**
    ```bash
    bash infra/scripts/doctor-l1.sh || true
    test -d infra/ghostchain/secrets && ls -la infra/ghostchain/secrets || true
    ```

### L2 “is up”: `infra/scripts/doctor-l2.sh`

- [ ] **L2 doctor (local/dev secrets)**
  - **Purpose:** Validate OP Stack L2 wiring, derivation/safe lag checks, and batcher/proposer activity thresholds.
  - **Command:**
    ```bash
    ALLOW_DEV_SECRETS=1 bash infra/scripts/doctor-l2.sh
    ```
  - **Pass:** Ends with `[doctor-l2] OK`; metrics endpoints reachable; contract checks pass if deployments JSONs are present.
  - **Likely fails:** `Dev secrets blocked`; **sequencer stopped** (`admin_sequencerActive=false`); L2 execution not progressing when `L2_REQUIRE_L2_PROGRESS=1` (delta-based check); op-node RPC unreachable (`OP_NODE_RPC`); L1 derivation lag too high; batcher/proposer idle past thresholds.
  - **Debug:**
    ```bash
    curl -fsS http://localhost:9546 -H 'content-type: application/json' \
      -d '{"jsonrpc":"2.0","id":1,"method":"optimism_syncStatus","params":[]}' | head -c 200; echo
    curl -fsS http://localhost:9646 -H 'content-type: application/json' \
      -d '{"jsonrpc":"2.0","id":1,"method":"admin_sequencerActive","params":[]}'
    UNSAFE_HEAD_HASH="$(curl -fsS http://localhost:9646 -H 'content-type: application/json' \
      -d '{"jsonrpc":"2.0","id":1,"method":"optimism_syncStatus","params":[]}' | jq -r '.result.unsafe_l2.hash')"
    curl -fsS http://localhost:9646 -H 'content-type: application/json' \
      -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"admin_startSequencer\",\"params\":[\"${UNSAFE_HEAD_HASH}\"]}"
    curl -fsS http://localhost:7300/metrics | head -n 5
    curl -fsS http://localhost:7301/metrics | head -n 5
    curl -fsS http://localhost:7302/metrics | head -n 5
    ```

- [ ] **L2 doctor (staging/prod Vault secrets)**
  - **Purpose:** Same checks, but secrets must be sourced from Vault.
  - **Requires (names only):** `L2_SECRETS_SOURCE=vault` and Vault auth via `VAULT_ADDR` + (`VAULT_TOKEN` or `VAULT_ROLE_ID` + `VAULT_SECRET_ID`).
  - **Command:**
    ```bash
    L2_SECRETS_SOURCE=vault bash infra/scripts/doctor-l2.sh
    ```
  - **Pass:** Includes `OK: Vault secrets present` and ends with `[doctor-l2] OK`.
  - **Likely fails:** Vault auth missing; required secret files missing under `L2_SECRETS_DIR`.
  - **Debug:**
    ```bash
    bash infra/scripts/doctor-l2.sh || true
    test -d infra/opstack/secrets && ls -la infra/opstack/secrets || true
    ```

### L3 “is up”: `infra/scripts/doctor-l3.sh`

- [ ] **L3 doctor (local/dev secrets)**
  - **Purpose:** Validate L3 config, parent L2 reachability, rollup RPC sync status, and L3 contract bytecode checks.
  - **Command:**
    ```bash
    ALLOW_DEV_SECRETS=1 bash infra/scripts/doctor-l3.sh
    ```
  - **Pass:** Ends with `OK: L3 doctor checks completed`; contract bytecode checks pass; rollup RPC is reachable.
  - **Likely fails:** `Dev secrets blocked`; L3 execution not progressing when `L3_REQUIRE_L3_PROGRESS=1` (delta-based check); parent L2 RPC unreachable (`HOST_L2_RPC` / `PARENT_L2_RPC`); missing L3 config files; `L3_PORTAL_ADDRESS`/`L3_SYSTEM_CONFIG_ADDRESS` missing or has no bytecode.
  - **Debug:**
    ```bash
    curl -fsS http://localhost:39546 -H 'content-type: application/json' \
      -d '{"jsonrpc":"2.0","id":1,"method":"optimism_syncStatus","params":[]}' | head -c 200; echo
    curl -fsS http://localhost:39545 -H 'content-type: application/json' \
      -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'
    docker compose -f infra/opstack/docker-compose.l3.yml ps
    ```

- [ ] **L3 doctor (staging/prod Vault secrets)**
  - **Purpose:** Same checks, but secrets must be sourced from Vault.
  - **Requires (names only):** `L3_SECRETS_SOURCE=vault` and Vault auth via `VAULT_ADDR` + (`VAULT_TOKEN` or `VAULT_ROLE_ID` + `VAULT_SECRET_ID`).
  - **Command:**
    ```bash
    L3_SECRETS_SOURCE=vault bash infra/scripts/doctor-l3.sh
    ```
  - **Pass:** Includes `OK: Vault secrets present`; ends with `OK: L3 doctor checks completed`.
  - **Likely fails:** Vault auth missing; required secret files missing under `L3_SECRETS_DIR`.
  - **Debug:**
    ```bash
    bash infra/scripts/doctor-l3.sh || true
    test -d infra/opstack/secrets && ls -la infra/opstack/secrets || true
    ```

## 3) Gates: `l1-go-no-go.sh`, `l2-go-no-go.sh`, `l3-go-no-go.sh`, `ai-go-no-go.sh`

- [ ] **L1 go/no-go**
  - **Purpose:** Final readiness gate for L1 (RPC load/stability, monitoring, evidence pack, invariants, Trivy scan, policy registry checks).
  - **Command:**
    ```bash
    bash infra/scripts/gates/l1-go-no-go.sh
    ```
  - **Pass:** Prints `L1 go/no-go gates passed` and exits `0`.
  - **Likely fails:** Trivy missing; evidence pack generation failed; invariant tests fail; policy registry RPC unreachable.
  - **Debug:**
    ```bash
    bash infra/scripts/doctor-l1.sh || true
    bash infra/scripts/evidence-pack-l1.sh || true
    command -v trivy >/dev/null && trivy --version || true
    ```

- [ ] **L2 go/no-go**
  - **Purpose:** Final readiness gate for L2; enforces progress automatically in staging/prod (`STACK_ENV`/`L2_ENV`) by calling `doctor-l2.sh` with `L2_REQUIRE_L2_PROGRESS=1`.
  - **Command:**
    ```bash
    bash infra/scripts/gates/l2-go-no-go.sh
    ```
  - **Pass:** Prints `[l2-go-no-go] OK` and exits `0`.
  - **Likely fails:** `doctor-l2.sh` fails; L2 RPC unstable; AI monitor unreachable; invariants fail.
  - **Debug:**
    ```bash
    L2_REQUIRE_L2_PROGRESS=1 bash infra/scripts/doctor-l2.sh || true
    curl -fsS http://localhost:7575/health || true
    bash infra/scripts/evidence-pack-l2.sh || true
    ```

- [ ] **L3 go/no-go**
  - **Purpose:** Final readiness gate for L3; enforces progress automatically in staging/prod (`STACK_ENV`/`L3_ENV`) by calling `doctor-l3.sh` with `L3_REQUIRE_L3_PROGRESS=1`.
  - **Command:**
    ```bash
    bash infra/scripts/gates/l3-go-no-go.sh
    ```
  - **Pass:** Prints `[l3-go-no-go] OK` and exits `0`.
  - **Likely fails:** `doctor-l3.sh` fails; parent L2 RPC unreachable; L3 RPC unstable; evidence pack missing.
  - **Debug:**
    ```bash
    L3_REQUIRE_L3_PROGRESS=1 bash infra/scripts/doctor-l3.sh || true
    bash infra/scripts/evidence-pack-l3.sh || true
    ```

- [ ] **AI governance go/no-go**
  - **Purpose:** Validates governance artifacts + federation invariants + failure-mode drills + evidence reproducibility.
  - **Command:**
    ```bash
    bash infra/scripts/gates/ai-go-no-go.sh
    ```
  - **Pass:** Prints `AI governance go/no-go: OK` and exits `0`.
  - **Likely fails:** Missing required docs/reports; federation invariants fail; evidence pack reproducibility fails; dirty working tree (except allowed generated paths).
  - **Debug:**
    ```bash
    git status --porcelain
    EVIDENCE_TIMESTAMP=20260203T180000Z \
    EVIDENCE_EPOCH=1760100000 \
    bash infra/scripts/evidence-pack-ai-governance.sh --verify || true
    ```

## 4) Bridge E2E (dry-run by default): `bridge-e2e.sh --mode l1l2|l2l3`

- [ ] **Bridge E2E dry-run (L1<->L2)**
  - **Purpose:** Validate required demo scripts exist; does not submit transactions.
  - **Command:**
    ```bash
    bash infra/scripts/bridge-e2e.sh --mode l1l2
    ```
  - **Pass:** Prints `Dry run...` and `Bridge E2E complete`.
  - **Likely fails:** Demo scripts missing or not executable.
  - **Debug:**
    ```bash
    ls -la infra/scripts/demo-deposit-l1l2-erc20.sh infra/scripts/demo-withdraw-l1l2-erc20.sh
    ```

- [ ] **Bridge E2E dry-run (L2<->L3)**
  - **Purpose:** Validate required demo scripts exist; does not submit transactions.
  - **Command:**
    ```bash
    bash infra/scripts/bridge-e2e.sh --mode l2l3
    ```
  - **Pass:** Prints `Dry run...` and `Bridge E2E complete`.
  - **Likely fails:** Demo scripts missing or not executable.
  - **Debug:**
    ```bash
    ls -la infra/scripts/demo-deposit-erc20.sh infra/scripts/demo-finalize-erc20.sh infra/scripts/demo-withdraw-erc20.sh
    ```

- [ ] **RUN (submits txs): Bridge E2E execute (L1<->L2)**
  - **Purpose:** Run ERC20 deposit + withdraw across L1↔L2 (StandardBridge); submits transactions.
  - **Command:**
    ```bash
    bash infra/scripts/bridge-e2e.sh --mode l1l2 --run --amount 1
    ```
  - **Pass:** Script exits `0`; `.tmp/last_l1l2_deposit_erc20.json` / `.tmp/last_l1l2_withdraw_erc20.json` written; balances reflect movement.
  - **Likely fails:** Missing addresses in `services/stack.env`; L1/L2 RPC unreachable; Hardhat not installed.
  - **Debug:**
    ```bash
    test -f services/stack.env && echo "OK: services/stack.env present" || echo "Missing services/stack.env"
    bash infra/scripts/doctor-l1.sh || true
    bash infra/scripts/doctor-l2.sh || true
    ls -la .tmp || true
    ```

- [ ] **RUN (submits txs): Bridge E2E execute (L2<->L3)**
  - **Purpose:** Run ERC20 deposit + relay + withdraw across L2↔L3; submits transactions and requires relayer not observe-only.
  - **Command:**
    ```bash
    bash infra/scripts/bridge-e2e.sh --mode l2l3 --run --amount 1
    ```
  - **Pass:** Script exits `0`; relayer reports last relayed nonce/amount; balances update.
  - **Likely fails:** Relayer observe-only; relayer not running; missing `services/ghost-guard/.env` or `services/ghost-relayer/.env`.
  - **Debug:**
    ```bash
    curl -fsS http://localhost:7171/health | jq .
    bash infra/scripts/doctor-l2.sh || true
    bash infra/scripts/doctor-l3.sh || true
    ```

## 5) ERC20 demo flows you can wire into E2E

### L1→L2 deposit (submits txs): `contracts/scripts/demo_l1_deposit_erc20.ts`

- [ ] **RUN via wrapper (recommended)**
  - **Purpose:** Deposit ERC20 from L1→L2 and verify L2 balance; submits transactions.
  - **Command:**
    ```bash
    DEMO_AMOUNT_ETH=1 bash infra/scripts/demo-deposit-l1l2-erc20.sh
    ```
  - **Pass:** Hardhat prints a tx hash; `.tmp/last_l1l2_deposit_erc20.json` written; L2 balance check prints expected values.
  - **Likely fails:** Missing addresses in `services/stack.env`; Hardhat deps missing; RPC endpoints down.
  - **Debug:**
    ```bash
    bash infra/scripts/doctor-l1.sh || true
    bash infra/scripts/doctor-l2.sh || true
    ls -la .tmp || true
    ```
  - **Note:** This wrapper may update `L2_TOKEN_ADDRESS` in `services/stack.env` (tracked) to keep envs aligned.

- [ ] **RUN via direct Hardhat (advanced)**
  - **Purpose:** Same as wrapper, but you control env wiring explicitly; submits transactions.
  - **Requires (names only):** `L1_STANDARD_BRIDGE_ADDRESS`, `L1_TOKEN_ADDRESS`, `L2_TOKEN_ADDRESS`, `RPC_L1`, `DEMO_AMOUNT_ETH`, optional `DEMO_TO`.
  - **Command:**
    ```bash
    cd contracts
    npx hardhat run --network anvil --no-compile scripts/demo_l1_deposit_erc20.ts
    ```
  - **Pass:** Prints `BridgeInitiated emitted.` and writes `.tmp/last_l1l2_deposit_erc20.json`.
  - **Likely fails:** Missing env vars; Hardhat network misconfigured.
  - **Debug:**
    ```bash
    node -v
    npm -v
    ```

### L2 withdraw (submits txs): `contracts/scripts/demo_l2_withdraw_erc20.ts`

- [ ] **RUN via wrapper (recommended)**
  - **Purpose:** Withdraw ERC20 from L2→L1 and verify L1 balance; submits transactions.
  - **Command:**
    ```bash
    DEMO_AMOUNT_ETH=1 bash infra/scripts/demo-withdraw-l1l2-erc20.sh
    ```
  - **Pass:** Hardhat prints a tx hash; `.tmp/last_l1l2_withdraw_erc20.json` written; L1 balance check prints expected values.
  - **Likely fails:** Missing addresses in `services/stack.env`; RPC endpoints down.
  - **Debug:**
    ```bash
    bash infra/scripts/doctor-l1.sh || true
    bash infra/scripts/doctor-l2.sh || true
    ls -la .tmp || true
    ```

- [ ] **RUN via direct Hardhat (advanced)**
  - **Purpose:** Same as wrapper, but you control env wiring explicitly; submits transactions.
  - **Requires (names only):** `L2_STANDARD_BRIDGE_ADDRESS`, `L2_TOKEN_ADDRESS`, `L1_TOKEN_ADDRESS`, `OP_L2_RPC`, `DEMO_AMOUNT_ETH`, optional `DEMO_TO`.
  - **Command:**
    ```bash
    cd contracts
    npx hardhat run --network ghostl2Op --no-compile scripts/demo_l2_withdraw_erc20.ts
    ```
  - **Pass:** Prints `BridgeInitiated emitted.` and writes `.tmp/last_l1l2_withdraw_erc20.json`.
  - **Likely fails:** Missing env vars; Hardhat network misconfigured.
  - **Debug:**
    ```bash
    node -v
    npm -v
    ```

## 6) Evidence / Outputs

- [ ] **List evidence packs**
  - **Purpose:** Evidence packs are created by go/no-go gates and can be verified via `.sha256` sidecars.
  - **Command:**
    ```bash
    ls -la infra/evidence/out 2>/dev/null || echo "No infra/evidence/out yet"
    ```
  - **Pass:** You see `evidence-pack-*-<timestamp>.zip` files and matching `.sha256`.
  - **Likely fails:** None (directory may not exist yet).
  - **Debug:**
    ```bash
    bash infra/scripts/evidence-pack-l1.sh
    bash infra/scripts/evidence-pack-l2.sh
    bash infra/scripts/evidence-pack-l3.sh
    ```

- [ ] **Inspect the latest bridge demo outputs**
  - **Purpose:** Bridge demos write machine-readable JSON receipts under `.tmp/`.
  - **Command:**
    ```bash
    ls -la .tmp 2>/dev/null || echo "No .tmp yet"
    ```
  - **Pass:** You see `last_*.json` artifacts (tx hashes, addresses, nonces).
  - **Likely fails:** Demos haven’t been run yet.
  - **Debug:**
    ```bash
    for f in .tmp/last_*.json; do echo "== $f"; jq . "$f"; done 2>/dev/null || true
    ```

- [ ] **Run Trivy filesystem scan (optional but recommended)**
  - **Purpose:** Actionable vuln+secret+misconfig scan with repo-specific skip rules and secret allow rules.
  - **Command:**
    ```bash
    bash ops/scripts/scan.sh
    ```
  - **Pass:** Exits `0` and writes `ops/security/trivy-fs.json`.
  - **Likely fails:** Trivy missing; scan finds HIGH/CRITICAL; permissions errors in local node data dirs.
  - **Debug:**
    ```bash
    command -v trivy >/dev/null && trivy --version || true
    ls -la ops/security
    ```

## 7) If Something Fails (fast triage)

- **RPC unreachable**
  - Run the layer doctor: `bash infra/scripts/doctor-l1.sh` / `bash infra/scripts/doctor-l2.sh` / `bash infra/scripts/doctor-l3.sh`
  - Check ports: `ss -lnt | rg ':18545|:29547|:39545|:39546' || true`
  - Check JSON-RPC quickly:
    ```bash
    curl -fsS http://localhost:18545 -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}'
    curl -fsS http://localhost:29547 -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}'
    curl -fsS http://localhost:39545 -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}'
    ```

- **ChainId mismatch**
  - Usually means you’re pointed at the wrong RPC or the wrong genesis/config.
  - Re-run the doctor; it prints expected vs actual chain IDs.

- **“No progress” / “unsafe head is zero”**
  - In staging/prod, gates call doctors with `L2_REQUIRE_L2_PROGRESS=1` / `L3_REQUIRE_L3_PROGRESS=1`.
  - Check rollup sync status:
    ```bash
    curl -fsS http://localhost:9546 -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"optimism_syncStatus","params":[]}' | head -c 200; echo
    curl -fsS http://localhost:39546 -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"optimism_syncStatus","params":[]}' | head -c 200; echo
    ```

- **Relayer observe-only**
  - L2↔L3 execute steps require a relayer with signing keys configured.
  - Check:
    ```bash
    curl -fsS http://localhost:7171/health | jq '.observeOnly, .lastRelayed'
    ```

- **Policy registry missing**
  - If `AI_MONITOR_OBSERVE_ONLY=0` and `POLICY_REQUIRED=1`, `doctor-l2.sh` fails closed.
  - Ensure `POLICY_REGISTRY_ADDRESS` + RPC are configured (names only).

---

# Next Step Recommendations (Production-Grade, Autonomous L1+L2+L3)

Below is a prioritized roadmap. Each item includes acceptance criteria and suggested implementation locations.

## 1) Fix federation progress gating (highest priority)

- **Goal:** Make “progress” an operational invariant: chains must advance, derive parent data, and remain within lag thresholds.
- **Where:** `infra/scripts/doctor-l2.sh`, `infra/scripts/doctor-l3.sh`, plus any automation that claims “up” status (e.g., `infra/scripts/doctor.sh`).
- **Acceptance criteria:**
  - A stalled chain (no new blocks over a window) fails when `*_REQUIRE_*_PROGRESS=1`.
  - A healthy chain passes even if `optimism_syncStatus` temporarily omits fields (use fallback signals).

## 2) Update `doctor-l2.sh` + `doctor-l3.sh` progress to use `eth_blockNumber` delta over time

- **Goal:** Make progress gating unambiguous: require execution head movement over a window, not just “head != 0”.
- **Where:** `infra/scripts/doctor-l2.sh`, `infra/scripts/doctor-l3.sh`
- **Current implementation (recommended):**
  - When `L2_REQUIRE_L2_PROGRESS=1`, `doctor-l2.sh` samples `eth_blockNumber` twice and fails if `delta < L2_PROGRESS_MIN_DELTA` over `L2_PROGRESS_SAMPLE_SECONDS`.
  - When `L3_REQUIRE_L3_PROGRESS=1`, `doctor-l3.sh` does the same with `L3_PROGRESS_*` knobs.
  - If `optimism_syncStatus` reports zeros while execution advances, doctors warn and skip derivation/safe-lag checks (progress gating still relies on `eth_blockNumber` delta).
- **Acceptance criteria:**
  - With block production paused, doctors fail within ~30–60s.
  - With block production enabled, doctors pass and report the observed delta.

## 3) Enforce progress in staging/prod gates (`L2_REQUIRE_L2_PROGRESS=1`, `L3_REQUIRE_L3_PROGRESS=1`)

- **Goal:** Ensure go/no-go gates actually enforce progress, not just reachability.
- **Where:** `infra/scripts/gates/l2-go-no-go.sh`, `infra/scripts/gates/l3-go-no-go.sh`
- **Notes:** These gates already enable progress checks automatically for `STACK_ENV`/`L2_ENV`/`L3_ENV` in `staging`/`prod` by calling doctors with `*_REQUIRE_*_PROGRESS=1`. Keep the delta window and min delta tuned for your expected block time.
- **Acceptance criteria:**
  - In staging/prod, a stalled L2 or L3 fails the gate even if RPC responds.

## 4) Resolve L3 `BATCH_INBOX_ADDRESS` mismatch via a single source of truth

- **Goal:** Eliminate config drift (deployment JSON vs env files vs rollup config).
- **Pipeline:** deployment JSON → env-sync → `.env` generation → rollup config generation.
- **Where:** `infra/scripts/env-sync-l3.sh`, `infra/opstack/l3/*/config/rollup.json`, `services/stack.env` generation (if applicable).
- **Acceptance criteria:**
  - `doctor-l3.sh` emits no `BATCH_INBOX_ADDRESS differs...` warnings.
  - The address matches across all generated outputs and runtime env.

## 5) Make security scans actionable (reduce noise, increase signal)

- **Goal:** Scan what matters and baseline/skip what doesn’t.
- **Where:** `.github/workflows/nightly-security.yml`, `ops/scripts/scan.sh`, `trivy-secret.yaml`
- **Actions:**
  - Add scan scope rules to exclude `**/rollback/**` and upstream OP testdata from **misconfig** scanning (skip or baseline).
  - Keep secret scanning fast via `--skip-dirs/--skip-files` plus `--secret-config trivy-secret.yaml`.
  - For contexts where secrets are irrelevant (e.g., vuln-only), use `--scanners vuln,misconfig` to disable secret scanning.
- **Acceptance criteria:**
  - Nightly reports have stable, reviewable deltas (few noisy repeats).
  - CI secret scanning remains strict on tracked code.

## 6) Harden production Dockerfiles first

- **Goal:** Reduce blast radius (least privilege by default).
- **Where:** `services/*/Dockerfile`, `apps/*/Dockerfile`
- **Checklist:**
  - Run as non-root (`USER`).
  - Drop Linux capabilities; add only what’s needed.
  - Prefer read-only filesystem + explicit writable mounts.
  - Minimize packages; pin versions where feasible.
- **Acceptance criteria:**
  - Containers start successfully under non-root.
  - Security scan findings decrease release-over-release.

## 7) Add contract-focused static analysis gates

- **Goal:** High-signal contract SAST without scanning upstream vendor trees.
- **Where:** `.github/workflows/ci.yml` (new job), `scripts/security/` (configs)
- **Actions:**
  - Run Slither + Semgrep on `contracts/src/**` only.
  - Explicitly exclude upstream OP trees and generated outputs.
- **Acceptance criteria:**
  - CI fails on new high-severity findings in `contracts/src/**`.
  - Baselines exist for known acceptable findings with justification.

## 8) Close the loop on “autonomous but governance-locked”

- **Goal:** Automation can propose/act only when on-chain policy permits, with evidence bound to each action.
- **Where:** `ghost-helper-bots/`, services that propose actions, and any runner that currently accepts a “policy ok” bypass.
- **Actions:**
  - Replace `GHOST_POLICY_OK=true`-style bypasses with real `PolicyRegistry` reads.
  - Require evidence bundle hash references for every automated proposal/action.
- **Acceptance criteria:**
  - A proposal/action cannot be generated or submitted without (a) on-chain policy approval and (b) an evidence hash logged.

## Open Questions (max 3)

1) Do staging/prod environments want Trivy scans enforced in L2/L3 go/no-go by default (`L2_GO_NO_GO_REQUIRE_SCANS=1`, `L3_GO_NO_GO_REQUIRE_SCANS=1`)?
2) Where should the single “source of truth” for cross-layer addresses live (deployment JSON under `infra/opstack/config/`, or `services/stack.env` generated from it)?
3) Should `bridge-e2e.sh` also grow an explicit ETH-mode for L2↔L3 (separate from the ERC20 smoke path)?
