#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

MODE="${MODE:-production}"
SECRETS_SOURCE="${SECRETS_SOURCE:-auto}"

INSTALL_DEPS=0
START_STACK=0
RUN_BRIDGE_DRYRUNS=0
BUILD_SERVICES=0
RUN_AI_GATE=1
SKIP_BUILD=0
SKIP_GATES=0
ALLOW_DIRTY=0
ALLOW_FINALITY_FALLBACK=0
DRY_RUN=0

START_TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
RUN_STAMP="$(date -u +%Y%m%d-%H%M%S)"
SUMMARY_DIR="${SUMMARY_DIR:-$ROOT_DIR/ops/preflight/$RUN_STAMP}"
SUMMARY_TSV="$SUMMARY_DIR/production-bootstrap-steps.tsv"
SUMMARY_JSON="$SUMMARY_DIR/production-bootstrap-summary.json"

mkdir -p "$SUMMARY_DIR"

timestamp() {
  date -u +%Y-%m-%dT%H:%M:%SZ
}

log() {
  printf '[%s] %s\n' "$(timestamp)" "$*"
}

die() {
  log "ERROR: $*"
  exit 1
}

usage() {
  cat <<'USAGE'
Usage: configure-build-ready.sh [options]

Run end-to-end configure + build + readiness gates for GhostL stack.

Options:
  --mode=dev|staging|production   Deployment mode (default: production)
  --secrets=auto|dev|vault        Secrets source (default: auto; dev->dev, others->vault)
  --install-deps                  Run npm ci (root + contracts)
  --start-stack                   Start stack via infra/scripts/up-full.sh
  --build-services                Build service images via npm run build:services
  --bridge-dry-runs               Run bridge dry-runs after gates
  --skip-build                    Skip build phase
  --skip-gates                    Skip go/no-go gates
  --skip-ai-gate                  Skip ai-go-no-go.sh
  --allow-dirty                   Allow dirty working tree for AI gate
  --allow-finality-fallback       Allow temporary RELAYER_REQUIRE_L2_FINALITY_ON_L1=false if proposer health is unreachable
  --dry-run                       Print planned commands without executing
  -h, --help                      Show help

Credential sources (env):
  VAULT_ENV_FILE                  Path to env file containing VAULT_ADDR and token or AppRole values
  VAULT_TOKEN_FILE                Path to token file (first line used)
  VAULT_ROLE_ID_FILE              Path to AppRole role_id file
  VAULT_SECRET_ID_FILE            Path to AppRole secret_id file

Examples:
  bash infra/scripts/production/configure-build-ready.sh --mode=production --secrets=vault
  bash infra/scripts/production/configure-build-ready.sh --mode=staging --install-deps --start-stack
  bash infra/scripts/production/configure-build-ready.sh --mode=dev --secrets=dev --dry-run
  bash infra/scripts/production/configure-build-ready.sh --mode=production --secrets=vault --allow-finality-fallback
USAGE
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"
}

read_env_value() {
  local file="$1"
  local key="$2"
  if [ ! -f "$file" ]; then
    return 1
  fi
  local raw
  raw="$(grep -E "^${key}=" "$file" | tail -n1 | cut -d= -f2- || true)"
  raw="${raw%\"}"
  raw="${raw#\"}"
  printf '%s' "$raw"
}

upsert_env_value() {
  local file="$1"
  local key="$2"
  local value="$3"
  if [ ! -f "$file" ]; then
    die "missing env file for upsert: $file"
  fi
  if grep -q "^${key}=" "$file"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$file"
  else
    printf '\n%s=%s\n' "$key" "$value" >>"$file"
  fi
}

first_readable_file() {
  for p in "$@"; do
    [ -n "${p:-}" ] || continue
    if [ -f "$p" ] && [ -r "$p" ]; then
      printf '%s' "$p"
      return 0
    fi
  done
  return 1
}

first_nonempty_env_value_from_files() {
  local key="$1"
  shift
  for f in "$@"; do
    [ -n "${f:-}" ] || continue
    [ -f "$f" ] || continue
    local v
    v="$(read_env_value "$f" "$key" || true)"
    if [ -n "$v" ]; then
      printf '%s' "$v"
      return 0
    fi
  done
  return 1
}

strip_vault_keys_from_env_file() {
  local file="$1"
  [ -f "$file" ] || return 0
  sed -i '/^VAULT_ADDR=/d;/^VAULT_TOKEN=/d;/^VAULT_ROLE_ID=/d;/^VAULT_SECRET_ID=/d' "$file"
}

STEP_INDEX=0
: >"$SUMMARY_TSV"

record_step() {
  local idx="$1"
  local name="$2"
  local status="$3"
  local rc="$4"
  local cmd="$5"
  printf '%s\t%s\t%s\t%s\t%s\n' "$idx" "$name" "$status" "$rc" "$cmd" >>"$SUMMARY_TSV"
}

run_step() {
  local name="$1"
  shift
  local cmd_display
  cmd_display="$(printf '%q ' "$@")"
  cmd_display="${cmd_display% }"

  STEP_INDEX=$((STEP_INDEX + 1))
  log "STEP ${STEP_INDEX}: ${name}"
  log "CMD: ${cmd_display}"

  if [ "$DRY_RUN" = "1" ]; then
    record_step "$STEP_INDEX" "$name" "dry-run" "0" "$cmd_display"
    return 0
  fi

  set +e
  "$@"
  local rc=$?
  set -e

  if [ "$rc" -eq 0 ]; then
    record_step "$STEP_INDEX" "$name" "ok" "$rc" "$cmd_display"
    return 0
  fi

  record_step "$STEP_INDEX" "$name" "failed" "$rc" "$cmd_display"
  return "$rc"
}

finish() {
  local rc=$?
  local end_ts
  end_ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  python3 - <<'PY' \
    "$SUMMARY_TSV" "$SUMMARY_JSON" "$MODE" "$SECRETS_SOURCE" "$START_TS" "$end_ts" "$DRY_RUN" "$INSTALL_DEPS" \
    "$START_STACK" "$SKIP_BUILD" "$SKIP_GATES" "$RUN_AI_GATE" "$RUN_BRIDGE_DRYRUNS" "$BUILD_SERVICES" "$ALLOW_DIRTY" "$ALLOW_FINALITY_FALLBACK" "$rc"
import json
import pathlib
import sys

(
    steps_tsv,
    out_json,
    mode,
    secrets_source,
    started_at,
    ended_at,
    dry_run,
    install_deps,
    start_stack,
    skip_build,
    skip_gates,
    run_ai_gate,
    run_bridge,
    build_services,
    allow_dirty,
    allow_finality_fallback,
    final_rc,
) = sys.argv[1:]

steps = []
tsv_path = pathlib.Path(steps_tsv)
if tsv_path.exists():
    for line in tsv_path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        idx, name, status, rc, cmd = line.split("\t", 4)
        steps.append(
            {
                "index": int(idx),
                "name": name,
                "status": status,
                "rc": int(rc),
                "command": cmd,
            }
        )

payload = {
    "status": "ok" if int(final_rc) == 0 else "failed",
    "finalRc": int(final_rc),
    "startedAt": started_at,
    "endedAt": ended_at,
    "mode": mode,
    "secretsSource": secrets_source,
    "options": {
        "dryRun": dry_run == "1",
        "installDeps": install_deps == "1",
        "startStack": start_stack == "1",
        "skipBuild": skip_build == "1",
        "skipGates": skip_gates == "1",
        "runAiGate": run_ai_gate == "1",
        "runBridgeDryRuns": run_bridge == "1",
        "buildServices": build_services == "1",
        "allowDirtyAiGate": allow_dirty == "1",
        "allowFinalityFallback": allow_finality_fallback == "1",
    },
    "steps": steps,
}

path = pathlib.Path(out_json)
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
PY

  if [ "$rc" -eq 0 ]; then
    log "Completed successfully."
    log "Summary: $SUMMARY_JSON"
  else
    log "Failed (rc=$rc)."
    log "Summary: $SUMMARY_JSON"
  fi
}
trap finish EXIT

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode=*)
      MODE="${1#*=}"
      shift
      ;;
    --secrets=*)
      SECRETS_SOURCE="${1#*=}"
      shift
      ;;
    --install-deps)
      INSTALL_DEPS=1
      shift
      ;;
    --start-stack)
      START_STACK=1
      shift
      ;;
    --build-services)
      BUILD_SERVICES=1
      shift
      ;;
    --bridge-dry-runs)
      RUN_BRIDGE_DRYRUNS=1
      shift
      ;;
    --skip-build)
      SKIP_BUILD=1
      shift
      ;;
    --skip-gates)
      SKIP_GATES=1
      shift
      ;;
    --skip-ai-gate)
      RUN_AI_GATE=0
      shift
      ;;
    --allow-dirty)
      ALLOW_DIRTY=1
      shift
      ;;
    --allow-finality-fallback)
      ALLOW_FINALITY_FALLBACK=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "unknown argument: $1"
      ;;
  esac
done

case "$MODE" in
  dev|staging|production) ;;
  *) die "invalid --mode: $MODE (expected dev|staging|production)" ;;
esac

if [ "$SECRETS_SOURCE" = "auto" ]; then
  if [ "$MODE" = "dev" ]; then
    SECRETS_SOURCE="dev"
  else
    SECRETS_SOURCE="vault"
  fi
fi

case "$SECRETS_SOURCE" in
  dev|vault) ;;
  *) die "invalid --secrets: $SECRETS_SOURCE (expected auto|dev|vault)" ;;
esac

if [ "$MODE" = "dev" ] && [ "$RUN_AI_GATE" = "1" ] && [ "$ALLOW_DIRTY" = "0" ]; then
  ALLOW_DIRTY=1
fi

if [ "$SECRETS_SOURCE" = "dev" ]; then
  ALLOW_DEV_SECRETS_VALUE=1
else
  ALLOW_DEV_SECRETS_VALUE=0
fi

need_cmd bash
need_cmd curl
need_cmd jq
need_cmd python3
need_cmd node
need_cmd npm
need_cmd docker
need_cmd git

if [ "$SKIP_BUILD" != "1" ]; then
  need_cmd cast
fi

[ -f "$ROOT_DIR/infra/opstack/.env" ] || die "missing infra/opstack/.env"
[ -f "$ROOT_DIR/infra/opstack/.env.l2" ] || die "missing infra/opstack/.env.l2"
[ -f "$ROOT_DIR/infra/opstack/.env.l3" ] || die "missing infra/opstack/.env.l3"
[ -f "$ROOT_DIR/infra/ghostchain/.env.l1" ] || die "missing infra/ghostchain/.env.l1"
[ -f "$ROOT_DIR/services/stack.env" ] || die "missing services/stack.env"

log "Mode: $MODE"
log "Secrets source: $SECRETS_SOURCE"
log "Summary directory: $SUMMARY_DIR"

L1_ENV_FILE_ACTIVE="$ROOT_DIR/infra/ghostchain/.env.l1"
L2_ENV_FILE_ACTIVE="$ROOT_DIR/infra/opstack/.env.l2"
L3_ENV_FILE_ACTIVE="$ROOT_DIR/infra/opstack/.env.l3"
STACK_ENV_FILE_ACTIVE="$ROOT_DIR/services/stack.env"

run_step "node-version-check" npm run node:check

if [ "$INSTALL_DEPS" = "1" ]; then
  run_step "npm-ci-root" npm ci
  run_step "npm-ci-contracts" npm --prefix "$ROOT_DIR/contracts" ci
fi

run_step "env-sync-l1" env ALLOW_DEV_SECRETS="$ALLOW_DEV_SECRETS_VALUE" bash "$ROOT_DIR/infra/scripts/env-sync-l1.sh"
run_step "env-sync-l2" env ALLOW_DEV_SECRETS="$ALLOW_DEV_SECRETS_VALUE" bash "$ROOT_DIR/infra/scripts/env-sync-l2.sh"
run_step "env-sync-l3" env ALLOW_DEV_SECRETS="$ALLOW_DEV_SECRETS_VALUE" bash "$ROOT_DIR/infra/scripts/env-sync-l3.sh"

L1_ENV_FILE_ACTIVE="$SUMMARY_DIR/.env.l1.override"
L2_ENV_FILE_ACTIVE="$SUMMARY_DIR/.env.l2.override"
L3_ENV_FILE_ACTIVE="$SUMMARY_DIR/.env.l3.override"
STACK_ENV_FILE_ACTIVE="$SUMMARY_DIR/stack.env.override"
cp "$ROOT_DIR/infra/ghostchain/.env.l1" "$L1_ENV_FILE_ACTIVE"
cp "$ROOT_DIR/infra/opstack/.env.l2" "$L2_ENV_FILE_ACTIVE"
cp "$ROOT_DIR/infra/opstack/.env.l3" "$L3_ENV_FILE_ACTIVE"
cp "$ROOT_DIR/services/stack.env" "$STACK_ENV_FILE_ACTIVE"

upsert_env_value "$L1_ENV_FILE_ACTIVE" "L1_SECRETS_SOURCE" "$SECRETS_SOURCE"
upsert_env_value "$L2_ENV_FILE_ACTIVE" "L2_SECRETS_SOURCE" "$SECRETS_SOURCE"
upsert_env_value "$L3_ENV_FILE_ACTIVE" "L3_SECRETS_SOURCE" "$SECRETS_SOURCE"

declare -a VAULT_ENV_FILE_CANDIDATES=()
if [ -n "${VAULT_ENV_FILE:-}" ]; then
  VAULT_ENV_FILE_CANDIDATES+=("$VAULT_ENV_FILE")
fi
VAULT_ENV_FILE_CANDIDATES+=(
  "$ROOT_DIR/.vault.env"
  "$HOME/.config/ghostchain/vault.env"
  "$HOME/.vault.env"
)

declare -a VAULT_TOKEN_FILE_CANDIDATES=()
if [ -n "${VAULT_TOKEN_FILE:-}" ]; then
  VAULT_TOKEN_FILE_CANDIDATES+=("$VAULT_TOKEN_FILE")
fi
VAULT_TOKEN_FILE_CANDIDATES+=(
  "/vault/token"
  "$HOME/.vault-token"
  "$HOME/.config/ghostchain/vault.token"
)

declare -a VAULT_ROLE_ID_FILE_CANDIDATES=()
if [ -n "${VAULT_ROLE_ID_FILE:-}" ]; then
  VAULT_ROLE_ID_FILE_CANDIDATES+=("$VAULT_ROLE_ID_FILE")
fi
VAULT_ROLE_ID_FILE_CANDIDATES+=(
  "/vault/role_id"
  "$HOME/.config/ghostchain/vault.role_id"
)

declare -a VAULT_SECRET_ID_FILE_CANDIDATES=()
if [ -n "${VAULT_SECRET_ID_FILE:-}" ]; then
  VAULT_SECRET_ID_FILE_CANDIDATES+=("$VAULT_SECRET_ID_FILE")
fi
VAULT_SECRET_ID_FILE_CANDIDATES+=(
  "/vault/secret_id"
  "$HOME/.config/ghostchain/vault.secret_id"
)

VAULT_ADDR_EFFECTIVE="${VAULT_ADDR:-}"
if [ -z "$VAULT_ADDR_EFFECTIVE" ]; then
  VAULT_ADDR_EFFECTIVE="$(read_env_value "$STACK_ENV_FILE_ACTIVE" "VAULT_ADDR" || true)"
fi
if [ -z "$VAULT_ADDR_EFFECTIVE" ]; then
  VAULT_ADDR_EFFECTIVE="$(first_nonempty_env_value_from_files "VAULT_ADDR" "${VAULT_ENV_FILE_CANDIDATES[@]}" || true)"
fi

VAULT_TOKEN_EFFECTIVE="${VAULT_TOKEN:-}"
if [ -z "$VAULT_TOKEN_EFFECTIVE" ]; then
  VAULT_TOKEN_EFFECTIVE="$(first_nonempty_env_value_from_files "VAULT_TOKEN" "${VAULT_ENV_FILE_CANDIDATES[@]}" || true)"
fi
if [ -z "$VAULT_TOKEN_EFFECTIVE" ]; then
  VAULT_TOKEN_FILE_EFFECTIVE="$(first_readable_file "${VAULT_TOKEN_FILE_CANDIDATES[@]}" || true)"
  if [ -n "$VAULT_TOKEN_FILE_EFFECTIVE" ]; then
    VAULT_TOKEN_EFFECTIVE="$(sed -n '1s/[[:space:]]*$//p' "$VAULT_TOKEN_FILE_EFFECTIVE")"
  fi
fi

VAULT_ROLE_ID_EFFECTIVE="${VAULT_ROLE_ID:-}"
if [ -z "$VAULT_ROLE_ID_EFFECTIVE" ]; then
  VAULT_ROLE_ID_EFFECTIVE="$(first_nonempty_env_value_from_files "VAULT_ROLE_ID" "${VAULT_ENV_FILE_CANDIDATES[@]}" || true)"
fi
if [ -z "$VAULT_ROLE_ID_EFFECTIVE" ]; then
  VAULT_ROLE_ID_FILE_EFFECTIVE="$(first_readable_file "${VAULT_ROLE_ID_FILE_CANDIDATES[@]}" || true)"
  if [ -n "$VAULT_ROLE_ID_FILE_EFFECTIVE" ]; then
    VAULT_ROLE_ID_EFFECTIVE="$(sed -n '1s/[[:space:]]*$//p' "$VAULT_ROLE_ID_FILE_EFFECTIVE")"
  fi
fi

VAULT_SECRET_ID_EFFECTIVE="${VAULT_SECRET_ID:-}"
if [ -z "$VAULT_SECRET_ID_EFFECTIVE" ]; then
  VAULT_SECRET_ID_EFFECTIVE="$(first_nonempty_env_value_from_files "VAULT_SECRET_ID" "${VAULT_ENV_FILE_CANDIDATES[@]}" || true)"
fi
if [ -z "$VAULT_SECRET_ID_EFFECTIVE" ]; then
  VAULT_SECRET_ID_FILE_EFFECTIVE="$(first_readable_file "${VAULT_SECRET_ID_FILE_CANDIDATES[@]}" || true)"
  if [ -n "$VAULT_SECRET_ID_FILE_EFFECTIVE" ]; then
    VAULT_SECRET_ID_EFFECTIVE="$(sed -n '1s/[[:space:]]*$//p' "$VAULT_SECRET_ID_FILE_EFFECTIVE")"
  fi
fi

strip_vault_keys_from_env_file "$L1_ENV_FILE_ACTIVE"
strip_vault_keys_from_env_file "$L2_ENV_FILE_ACTIVE"
strip_vault_keys_from_env_file "$L3_ENV_FILE_ACTIVE"
strip_vault_keys_from_env_file "$STACK_ENV_FILE_ACTIVE"

if [ -n "$VAULT_ADDR_EFFECTIVE" ]; then
  export VAULT_ADDR="$VAULT_ADDR_EFFECTIVE"
fi
if [ -n "$VAULT_TOKEN_EFFECTIVE" ]; then
  export VAULT_TOKEN="$VAULT_TOKEN_EFFECTIVE"
fi
if [ -n "$VAULT_ROLE_ID_EFFECTIVE" ]; then
  export VAULT_ROLE_ID="$VAULT_ROLE_ID_EFFECTIVE"
fi
if [ -n "$VAULT_SECRET_ID_EFFECTIVE" ]; then
  export VAULT_SECRET_ID="$VAULT_SECRET_ID_EFFECTIVE"
fi

if [ "$SECRETS_SOURCE" = "vault" ]; then
  vault_has_addr=0
  vault_has_token=0
  vault_has_approle=0
  [ -n "$VAULT_ADDR_EFFECTIVE" ] && vault_has_addr=1
  [ -n "$VAULT_TOKEN_EFFECTIVE" ] && vault_has_token=1
  if [ -n "$VAULT_ROLE_ID_EFFECTIVE" ] && [ -n "$VAULT_SECRET_ID_EFFECTIVE" ]; then
    vault_has_approle=1
  fi
  log "Vault auth loaded: addr=${vault_has_addr} token=${vault_has_token} approle=${vault_has_approle}"
  if [ "$vault_has_addr" != "1" ] || { [ "$vault_has_token" != "1" ] && [ "$vault_has_approle" != "1" ]; }; then
    die "Vault auth not found. Provide VAULT_ADDR plus VAULT_TOKEN or VAULT_ROLE_ID+VAULT_SECRET_ID (env, VAULT_ENV_FILE, token file, or AppRole files)."
  fi
fi

ROLLUP_FINALITY_REQUIRED="$(read_env_value "$STACK_ENV_FILE_ACTIVE" "RELAYER_REQUIRE_L2_FINALITY_ON_L1" || true)"
ROLLUP_FINALITY_REQUIRED="$(printf '%s' "${ROLLUP_FINALITY_REQUIRED:-false}" | tr '[:upper:]' '[:lower:]')"
L2_ROLLUP_PROPOSER_HEALTH_URL_CFG="$(read_env_value "$L2_ENV_FILE_ACTIVE" "L2_ROLLUP_PROPOSER_HEALTH_URL" || true)"
if [ -z "$L2_ROLLUP_PROPOSER_HEALTH_URL_CFG" ]; then
  L2_ROLLUP_PROPOSER_HEALTH_URL_CFG="http://localhost:7273/health"
fi

if [ "$ROLLUP_FINALITY_REQUIRED" = "true" ]; then
  if curl -fsS --max-time 3 "$L2_ROLLUP_PROPOSER_HEALTH_URL_CFG" >/dev/null 2>&1; then
    log "Rollup proposer health endpoint reachable: $L2_ROLLUP_PROPOSER_HEALTH_URL_CFG"
  else
    if [ "$MODE" = "dev" ] || [ "$ALLOW_FINALITY_FALLBACK" = "1" ]; then
      upsert_env_value "$STACK_ENV_FILE_ACTIVE" "RELAYER_REQUIRE_L2_FINALITY_ON_L1" "false"
      log "WARN: $L2_ROLLUP_PROPOSER_HEALTH_URL_CFG unreachable; using temporary RELAYER_REQUIRE_L2_FINALITY_ON_L1=false in $STACK_ENV_FILE_ACTIVE"
    else
      die "RELAYER_REQUIRE_L2_FINALITY_ON_L1=true but $L2_ROLLUP_PROPOSER_HEALTH_URL_CFG is unreachable. Start ghost-rollup-proposer-l2 (services/docker-compose.legacy.yml) or re-run with --allow-finality-fallback."
    fi
  fi
fi

run_step "sync-opstack-env-from-l1-deployments" bash "$ROOT_DIR/infra/scripts/opstack/sync-env-from-l1-deployments.sh" "$ROOT_DIR/infra/opstack/.env"
run_step "sync-opstack-env-from-l2-deployments" bash "$ROOT_DIR/infra/scripts/opstack/sync-env-from-l2-deployments.sh" "$ROOT_DIR/infra/opstack/.env.l3"

run_step "opstack-preflight-3layer" bash "$ROOT_DIR/infra/scripts/opstack/preflight-3layer.sh" "$ROOT_DIR/infra/opstack/.env" "$ROOT_DIR/infra/opstack/.env.l3"

if [ "$START_STACK" = "1" ]; then
  run_step "stack-up-full" bash "$ROOT_DIR/infra/scripts/up-full.sh"
fi

if [ "$SKIP_BUILD" != "1" ]; then
  run_step "build-apps" npm run build
  run_step "compile-contracts-docker" npm run compile:docker
  if [ "$BUILD_SERVICES" = "1" ]; then
    run_step "build-services-images" npm run build:services
  fi
fi

run_step "doctor-l1" env \
  L1_MODE="$MODE" \
  L1_ENV_FILE="$L1_ENV_FILE_ACTIVE" \
  L1_SECRETS_SOURCE="$SECRETS_SOURCE" \
  ALLOW_DEV_SECRETS="$ALLOW_DEV_SECRETS_VALUE" \
  bash "$ROOT_DIR/infra/scripts/doctor-l1.sh"

run_step "doctor-l2" env \
  STACK_ENV="$MODE" \
  L2_ENV="$MODE" \
  L2_ENV_FILE="$L2_ENV_FILE_ACTIVE" \
  STACK_ENV_FILE="$STACK_ENV_FILE_ACTIVE" \
  L2_SECRETS_SOURCE="$SECRETS_SOURCE" \
  ALLOW_DEV_SECRETS="$ALLOW_DEV_SECRETS_VALUE" \
  L2_AUTO_RECOVER_ON_STALL="$([ "$MODE" = "dev" ] && echo 0 || echo 1)" \
  L2_REQUIRE_L2_PROGRESS="$([ "$MODE" = "dev" ] && echo 0 || echo 1)" \
  bash "$ROOT_DIR/infra/scripts/doctor-l2.sh"

run_step "doctor-l3" env \
  STACK_ENV="$MODE" \
  L3_ENV="$MODE" \
  L3_ENV_FILE="$L3_ENV_FILE_ACTIVE" \
  STACK_ENV_FILE="$STACK_ENV_FILE_ACTIVE" \
  L3_SECRETS_SOURCE="$SECRETS_SOURCE" \
  ALLOW_DEV_SECRETS="$ALLOW_DEV_SECRETS_VALUE" \
  L3_AUTO_RECOVER_ON_STALL="$([ "$MODE" = "dev" ] && echo 0 || echo 1)" \
  L3_REQUIRE_L3_PROGRESS="$([ "$MODE" = "dev" ] && echo 0 || echo 1)" \
  bash "$ROOT_DIR/infra/scripts/doctor-l3.sh"

if [ "$SKIP_GATES" != "1" ]; then
  run_step "gate-l1-go-no-go" env \
    STACK_ENV="$MODE" \
    L1_MODE="$MODE" \
    L1_ENV_FILE="$L1_ENV_FILE_ACTIVE" \
    L1_SECRETS_SOURCE="$SECRETS_SOURCE" \
    ALLOW_DEV_SECRETS="$ALLOW_DEV_SECRETS_VALUE" \
    SKIP_VULN_SCAN="$([ "$MODE" = "dev" ] && echo 1 || echo 0)" \
    TRIVY_IMAGE_SCAN="$([ "$MODE" = "production" ] && echo 1 || echo 0)" \
    bash "$ROOT_DIR/infra/scripts/gates/l1-go-no-go.sh"

  run_step "gate-l2-go-no-go" env \
    STACK_ENV="$MODE" \
    L2_ENV="$MODE" \
    L2_ENV_FILE="$L2_ENV_FILE_ACTIVE" \
    STACK_ENV_FILE="$STACK_ENV_FILE_ACTIVE" \
    L2_SECRETS_SOURCE="$SECRETS_SOURCE" \
    ALLOW_DEV_SECRETS="$ALLOW_DEV_SECRETS_VALUE" \
    L2_AUTO_RECOVER_ON_STALL="$([ "$MODE" = "dev" ] && echo 0 || echo 1)" \
    L2_GO_NO_GO_REQUIRE_SCANS="$([ "$MODE" = "dev" ] && echo 0 || echo 1)" \
    L2_GO_NO_GO_REQUIRE_PROGRESS="$([ "$MODE" = "dev" ] && echo 0 || echo 1)" \
    bash "$ROOT_DIR/infra/scripts/gates/l2-go-no-go.sh"

  run_step "gate-l3-go-no-go" env \
    STACK_ENV="$MODE" \
    L3_ENV="$MODE" \
    L3_ENV_FILE="$L3_ENV_FILE_ACTIVE" \
    STACK_ENV_FILE="$STACK_ENV_FILE_ACTIVE" \
    L3_SECRETS_SOURCE="$SECRETS_SOURCE" \
    ALLOW_DEV_SECRETS="$ALLOW_DEV_SECRETS_VALUE" \
    L3_AUTO_RECOVER_ON_STALL="$([ "$MODE" = "dev" ] && echo 0 || echo 1)" \
    L3_GO_NO_GO_REQUIRE_SCANS="$([ "$MODE" = "dev" ] && echo 0 || echo 1)" \
    L3_GO_NO_GO_REQUIRE_PROGRESS="$([ "$MODE" = "dev" ] && echo 0 || echo 1)" \
    bash "$ROOT_DIR/infra/scripts/gates/l3-go-no-go.sh"

  if [ "$RUN_AI_GATE" = "1" ]; then
    run_step "gate-ai-go-no-go" env \
      AI_GO_NO_GO_ALLOW_DIRTY="$ALLOW_DIRTY" \
      bash "$ROOT_DIR/infra/scripts/gates/ai-go-no-go.sh"
  fi
fi

if [ "$RUN_BRIDGE_DRYRUNS" = "1" ]; then
  run_step "bridge-e2e-l1l2-dry-run" bash "$ROOT_DIR/infra/scripts/bridge-e2e.sh" --mode l1l2
  run_step "bridge-e2e-l2l3-dry-run" bash "$ROOT_DIR/infra/scripts/bridge-e2e.sh" --mode l2l3
fi

log "configure-build-ready completed"
