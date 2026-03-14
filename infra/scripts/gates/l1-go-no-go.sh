#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
L1_ENV_FILE="${L1_ENV_FILE:-$ROOT_DIR/infra/ghostchain/.env.l1}"
STACK_ENV_FILE="${STACK_ENV_FILE:-$ROOT_DIR/services/stack.env}"
STACK_ENV_MODE="$(printf '%s' "${STACK_ENV:-${L1_MODE:-dev}}" | tr '[:upper:]' '[:lower:]')"

# shellcheck source=scripts/lib/docker.sh
. "$ROOT_DIR/scripts/lib/docker.sh"

if [ -f "$L1_ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$L1_ENV_FILE"
  set +a
fi

HOST_L1_RPC="${HOST_L1_RPC:-http://localhost:18545}"
HOST_L2_RPC="${HOST_L2_RPC:-http://localhost:29547}"
HOST_L3_RPC="${HOST_L3_RPC:-http://localhost:39545}"
L1_METRICS_PROM_URL="${L1_METRICS_PROM_URL:-http://localhost:18660/debug/metrics/prometheus}"
PROMETHEUS_URL="${PROMETHEUS_URL:-http://localhost:9090}"
L1_METRICS_PROM_TARGET="${L1_METRICS_PROM_TARGET:-http://host.docker.internal:18660/debug/metrics/prometheus}"
AI_MONITOR_HEALTH_URL="${AI_MONITOR_HEALTH_URL:-http://localhost:7576/health}"
AI_MONITOR_METRICS_URL="${AI_MONITOR_METRICS_URL:-http://localhost:7576/metrics}"
POLICY_REGISTRY_ENV_FILE="${POLICY_REGISTRY_ENV_FILE:-$STACK_ENV_FILE}"
POLICY_REGISTRY_ADDRESS="${POLICY_REGISTRY_ADDRESS:-}"
POLICY_REGISTRY_RPC="${POLICY_REGISTRY_RPC:-}"

GATE_RPC_REQUESTS="${GATE_RPC_REQUESTS:-25}"
GATE_RPC_PARALLELISM="${GATE_RPC_PARALLELISM:-5}"
GATE_RPC_TIMEOUT="${GATE_RPC_TIMEOUT:-3}"

SKIP_RPC_LOAD="${SKIP_RPC_LOAD:-0}"
SKIP_RESTART_CHECK="${SKIP_RESTART_CHECK:-0}"
SKIP_MONITORING="${SKIP_MONITORING:-0}"
SKIP_AI_MONITOR="${SKIP_AI_MONITOR:-0}"
SKIP_POLICY_REGISTRY="${SKIP_POLICY_REGISTRY:-0}"
SKIP_INVARIANTS="${SKIP_INVARIANTS:-0}"
SKIP_EVIDENCE="${SKIP_EVIDENCE:-0}"
SKIP_VULN_SCAN="${SKIP_VULN_SCAN:-0}"
SKIP_DOCKER_CHECK="${SKIP_DOCKER_CHECK:-0}"
SKIP_CASCADING_ORACLE_CHECK="${SKIP_CASCADING_ORACLE_CHECK:-0}"
SKIP_POLICY_HASH_COMMIT="${SKIP_POLICY_HASH_COMMIT:-0}"
SKIP_GOVERNANCE_APPROVAL="${SKIP_GOVERNANCE_APPROVAL:-0}"
SKIP_CASCADING_FINALITY="${SKIP_CASCADING_FINALITY:-0}"
TRIVY_IMAGE_SCAN="${TRIVY_IMAGE_SCAN:-0}"

TRIVY_SECRET_CONFIG="${TRIVY_SECRET_CONFIG:-$ROOT_DIR/trivy-secret.yaml}"
TRIVY_SKIP_DIRS_DEFAULT="node_modules,contracts/node_modules,dist,contracts/dist,contracts/artifacts,contracts/cache,contracts/.hardhat-cache,contracts/typechain-types,contracts/proposals,contracts/.foundry-out,contracts/.foundry-cache,contracts/.foundry-out-local,contracts/.foundry-cache-local,artifacts,cache,backups,ops/snapshots,ops/preflight,contracts/out-codex,contracts/cache-codex,contracts/out-slither,contracts/cache-slither,infra/docker/_backup,infra/docker/audit,infra/docker/runtime,infra/ghostchain/data,infra/ghostchain/secrets,infra/opstack/data,infra/opstack/broadcast,infra/opstack/secrets,infra/opstack/l3,infra/opstack/l3/secrets,chains/l2/data,chains/l3/data,tools/ghostcontrol/secrets"
TRIVY_SKIP_FILES_DEFAULT=".env,**/.env,**/.env.*,ops/security/trivy-fs.json,contracts/reports/formal/scribble/scribble.json,contracts/artifacts/build-info/*.json,infra/opstack/op-geth/signer/fourbyte/4byte.json"
TRIVY_SKIP_DIRS="${TRIVY_SKIP_DIRS:-$TRIVY_SKIP_DIRS_DEFAULT}"
TRIVY_SKIP_FILES="${TRIVY_SKIP_FILES:-$TRIVY_SKIP_FILES_DEFAULT}"

warn() { echo "WARN: $*" >&2; }
fail() { echo "FAIL: $*" >&2; exit 1; }
info() { echo "[gate] $*"; }

STRICT_MODE=0
if [ "${SLITHER_STRICT:-0}" = "1" ] || [ -n "${CI:-}" ] || [ "${GITHUB_ACTIONS:-}" = "true" ]; then
  STRICT_MODE=1
fi

is_docker_daemon_unavailable() {
  local msg="${1:-}"
  msg="$(printf '%s' "$msg" | tr '[:upper:]' '[:lower:]')"
  case "$msg" in
    *"permission denied while trying to connect to the docker api"* ) return 0 ;;
    *"permission denied while trying to connect to the docker daemon socket"* ) return 0 ;;
    *"got permission denied while trying to connect to the docker daemon socket"* ) return 0 ;;
    *"cannot connect to the docker daemon"* ) return 0 ;;
    *"is the docker daemon running"* ) return 0 ;;
    *"error during connect"*docker.sock* ) return 0 ;;
    *dial\ unix*docker.sock*permission\ denied* ) return 0 ;;
    *dial\ unix*docker.sock*operation\ not\ permitted* ) return 0 ;;
    *dial\ unix*docker.sock*no\ such\ file\ or\ directory* ) return 0 ;;
    *) return 1 ;;
  esac
}

write_error_summary() {
  local error="$1"
  local detail="${2:-}"
  local out_dir="$ROOT_DIR/ops/preflight/$(date -u +%Y%m%d-%H%M%S)"
  local out_file="$out_dir/l1-go-no-go-error.json"
  mkdir -p "$out_dir"
  python3 - "$error" "$detail" >"$out_file" <<'PY'
import datetime
import json
import os
import sys

error = sys.argv[1] if len(sys.argv) > 1 else ""
detail = sys.argv[2] if len(sys.argv) > 2 else ""

payload = {
    "gate": "l1-go-no-go",
    "updatedAt": datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
    "strict": os.environ.get("SLITHER_STRICT") == "1" or bool(os.environ.get("CI")) or os.environ.get("GITHUB_ACTIONS") == "true",
    "error": error,
    "detail": detail,
}
print(json.dumps(payload, indent=2, sort_keys=True))
PY
  warn "error summary written: ${out_file#$ROOT_DIR/}"
}

skip_or_fail() {
  local message="$1"
  local detail="${2:-}"
  if [ "$STRICT_MODE" = "1" ]; then
    write_error_summary "$message" "$detail"
    fail "$message"
  fi
  warn "SKIPPED: $message"
  info "SKIPPED: $message"
  info "Hint: run on a host with Docker daemon access, or set SLITHER_STRICT=1 to fail hard."
  exit 0
}

need_bin() {
  command -v "$1" >/dev/null 2>&1 || fail "missing required binary: $1"
}

is_truthy() {
  case "$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]')" in
    1 | true | yes | on) return 0 ;;
    *) return 1 ;;
  esac
}

is_production_mode() {
  case "$STACK_ENV_MODE" in
    prod | production) return 0 ;;
    *) return 1 ;;
  esac
}

jsonrpc() {
  local url="$1"
  local method="$2"
  curl -fsS --max-time "$GATE_RPC_TIMEOUT" -X POST "$url" \
    -H 'content-type: application/json' \
    --data "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"${method}\",\"params\":[]}" \
    >/dev/null
}

get_code() {
  local url="$1"
  local address="$2"
  curl -fsS --max-time "$GATE_RPC_TIMEOUT" -X POST "$url" \
    -H 'content-type: application/json' \
    --data "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_getCode\",\"params\":[\"${address}\",\"latest\"]}"
}

read_env_value() {
  local file="$1"
  local key="$2"
  grep -E "^${key}=" "$file" 2>/dev/null | tail -n1 | cut -d= -f2- | tr -d '\"' || true
}

read_stack_env_value() {
  local key="$1"
  if [ -f "$STACK_ENV_FILE" ]; then
    read_env_value "$STACK_ENV_FILE" "$key"
  else
    echo ""
  fi
}

is_zero_address() {
  local value="$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]')"
  [ "$value" = "0x0000000000000000000000000000000000000000" ]
}

is_valid_address() {
  local value="${1:-}"
  [[ "$value" =~ ^0x[0-9a-fA-F]{40}$ ]]
}

is_valid_bytes32() {
  local value="${1:-}"
  [[ "$value" =~ ^0x[0-9a-fA-F]{64}$ ]]
}

extract_code_hex() {
  local json_payload="${1:-}"
  printf '%s' "$json_payload" | python3 -c 'import json,sys; print((json.load(sys.stdin) or {}).get("result",""))' 2>/dev/null || true
}

has_contract_code() {
  local rpc_url="$1"
  local address="$2"
  local code_json code_hex
  code_json="$(get_code "$rpc_url" "$address" 2>/dev/null || true)"
  code_hex="$(extract_code_hex "$code_json")"
  [ -n "$code_hex" ] && [ "$code_hex" != "0x" ]
}

resolve_contract_rpc() {
  local address="$1"
  local preferred_rpc="${2:-}"
  local candidate
  for candidate in "$preferred_rpc" "$HOST_L2_RPC" "$HOST_L1_RPC" "$HOST_L3_RPC"; do
    [ -n "$candidate" ] || continue
    if has_contract_code "$candidate" "$address"; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

resolve_policy_registry_address() {
  if [ -n "$POLICY_REGISTRY_ADDRESS" ]; then
    echo "$POLICY_REGISTRY_ADDRESS"
    return 0
  fi
  if [ -f "$POLICY_REGISTRY_ENV_FILE" ]; then
    local addr
    addr="$(read_env_value "$POLICY_REGISTRY_ENV_FILE" "POLICY_REGISTRY_ADDRESS")"
    if [ -z "$addr" ]; then
      addr="$(read_env_value "$POLICY_REGISTRY_ENV_FILE" "AGENT_POLICY_CONTRACT")"
    fi
    if [ -z "$addr" ]; then
      addr="$(read_env_value "$POLICY_REGISTRY_ENV_FILE" "GUARD_POLICY_ADDRESS")"
    fi
    if [ -n "$addr" ]; then
      echo "$addr"
      return 0
    fi
  fi
  echo ""
}

resolve_policy_registry_rpc() {
  if [ -n "$POLICY_REGISTRY_RPC" ]; then
    rpc="$POLICY_REGISTRY_RPC"
  else
    rpc=""
  fi
  if [ -z "$rpc" ] && [ -f "$POLICY_REGISTRY_ENV_FILE" ]; then
    rpc="$(read_env_value "$POLICY_REGISTRY_ENV_FILE" "POLICY_REGISTRY_RPC")"
    if [ -z "$rpc" ]; then
      rpc="$(read_env_value "$POLICY_REGISTRY_ENV_FILE" "AGENT_POLICY_RPC_URL")"
    fi
  fi
  if [ -z "$rpc" ]; then
    rpc="$HOST_L1_RPC"
  fi
  if [[ "$rpc" == *host.docker.internal* ]]; then
    if command -v getent >/dev/null 2>&1; then
      if ! getent hosts host.docker.internal >/dev/null 2>&1; then
        rpc="${rpc/host.docker.internal/localhost}"
      fi
    else
      rpc="${rpc/host.docker.internal/localhost}"
    fi
  fi
  echo "$rpc"
}

check_restart_policy() {
  local compose_file="$1"
  local service="$2"
  local cid
  cid="$(
    hg_docker compose --project-directory "$(dirname "$compose_file")" -f "$compose_file" ps -q "$service" 2>/dev/null || true
  )"
  if [ -z "$cid" ]; then
    fail "service $service not running for compose $compose_file"
  fi
  local policy status health
  policy="$(hg_docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' "$cid" 2>/dev/null || true)"
  status="$(hg_docker inspect -f '{{.State.Status}}' "$cid" 2>/dev/null || true)"
  health="$(hg_docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$cid" 2>/dev/null || true)"
  if [ "$policy" = "no" ] || [ -z "$policy" ]; then
    fail "service $service restart policy not set (got '$policy')"
  fi
  if [ "$status" != "running" ]; then
    fail "service $service not running (status=$status)"
  fi
  if [ -n "$health" ] && [ "$health" != "healthy" ]; then
    fail "service $service unhealthy (health=$health)"
  fi
  info "restart policy OK for $service ($policy)"
}

info "Phase 9 gate: L1 go/no-go"

need_bin curl
need_bin python3
need_bin docker

info "enforcing GST-native leakage gates"
"$ROOT_DIR/scripts/gst-leakage-gate.sh"
"$ROOT_DIR/scripts/gst-symbol-gate.sh"

DOCKER_AVAILABLE=1
if [ "$SKIP_DOCKER_CHECK" != "1" ]; then
  docker_version_out=""
  if ! docker_version_out="$(hg_docker version --format '{{.Server.Version}}' 2>&1)"; then
    if is_docker_daemon_unavailable "$docker_version_out"; then
      if [ "$STRICT_MODE" = "1" ]; then
        skip_or_fail "docker daemon/socket not reachable" "$docker_version_out"
      fi
      DOCKER_AVAILABLE=0
      warn "docker daemon/socket not reachable; continuing with RPC/HTTP checks only"
    else
      fail "docker version failed: ${docker_version_out:-unknown error}"
    fi
  fi
else
  DOCKER_AVAILABLE=0
  warn "docker daemon check skipped (SKIP_DOCKER_CHECK=1)"
fi

if [ "$DOCKER_AVAILABLE" = "1" ]; then
  if ! hg_docker compose version >/dev/null 2>&1; then
    fail "docker compose not available"
  fi
else
  warn "docker compose checks will be skipped (no daemon access)"
fi

if ! command -v forge >/dev/null 2>&1; then
  if [ -x "${HOME}/.foundry/bin/forge" ]; then
    export PATH="${HOME}/.foundry/bin:${PATH}"
  fi
fi

info "running doctor-l1"
if [ "$DOCKER_AVAILABLE" != "1" ]; then
  export L1_DOCTOR_SKIP_DOCKER=1
fi
"$ROOT_DIR/infra/scripts/doctor-l1.sh"

if [ "$SKIP_RPC_LOAD" != "1" ]; then
  info "RPC stability check (${GATE_RPC_REQUESTS} requests)"
  tmp_failures="$(mktemp)"
  trap 'rm -f "$tmp_failures"' RETURN
  if [ "$GATE_RPC_REQUESTS" -gt 0 ]; then
    if command -v xargs >/dev/null 2>&1; then
      seq 1 "$GATE_RPC_REQUESTS" | xargs -P "$GATE_RPC_PARALLELISM" -I{} \
        bash -c "curl -fsS --max-time '$GATE_RPC_TIMEOUT' -X POST '$HOST_L1_RPC' -H 'content-type: application/json' --data '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_blockNumber\",\"params\":[]}' >/dev/null || echo fail >> '$tmp_failures'"
    else
      for _ in $(seq 1 "$GATE_RPC_REQUESTS"); do
        if ! jsonrpc "$HOST_L1_RPC" "eth_blockNumber"; then
          echo fail >> "$tmp_failures"
        fi
      done
    fi
  fi
  failures="$(wc -l < "$tmp_failures" | tr -d ' ')"
  if [ "$failures" -gt 0 ]; then
    fail "RPC load check failed ($failures/${GATE_RPC_REQUESTS} errors)"
  fi
  info "RPC stability OK"
else
  warn "RPC load check skipped"
fi

if [ "$SKIP_RESTART_CHECK" != "1" ]; then
  info "restart resilience check"
  if [ "$DOCKER_AVAILABLE" != "1" ]; then
    warn "restart resilience check skipped (docker daemon/socket unavailable)"
  else
    L1_COMPOSE_FILE="${L1_COMPOSE_FILE:-$ROOT_DIR/infra/ghostchain/docker-compose.l1.yml}"
    check_restart_policy "$L1_COMPOSE_FILE" "ghostchain-node1"
    check_restart_policy "$L1_COMPOSE_FILE" "ghostchain-rpc-proxy"
  fi
else
  warn "restart resilience check skipped"
fi

if [ "$SKIP_MONITORING" != "1" ]; then
  info "monitoring data check"
  if ! curl -fsS --max-time 3 "$L1_METRICS_PROM_URL" >/dev/null 2>&1; then
    fail "L1 metrics endpoint not reachable: $L1_METRICS_PROM_URL"
  fi
  if curl -fsS --max-time 3 "$PROMETHEUS_URL/-/ready" >/dev/null 2>&1; then
    if curl -fsS --max-time 3 "$PROMETHEUS_URL/api/v1/targets" >/tmp/l1-gates-targets.json 2>/dev/null; then
      if ! grep -q "$L1_METRICS_PROM_TARGET" /tmp/l1-gates-targets.json; then
        fail "Prometheus targets missing L1 metrics ($L1_METRICS_PROM_TARGET)"
      fi
      if ! grep -q "ai-monitor" /tmp/l1-gates-targets.json; then
        fail "Prometheus targets missing ai-monitor job"
      fi
    else
      fail "Prometheus targets API not reachable"
    fi
  else
    fail "Prometheus not reachable at $PROMETHEUS_URL"
  fi
  info "monitoring targets OK"
else
  warn "monitoring data check skipped"
fi

if [ "$SKIP_AI_MONITOR" != "1" ]; then
  info "AI monitor health check"
  if ! curl -fsS --max-time 3 "$AI_MONITOR_HEALTH_URL" >/dev/null 2>&1; then
    fail "AI monitor health endpoint not reachable: $AI_MONITOR_HEALTH_URL"
  fi
  if ! curl -fsS --max-time 3 "$AI_MONITOR_METRICS_URL" >/dev/null 2>&1; then
    warn "AI monitor metrics endpoint not reachable: $AI_MONITOR_METRICS_URL"
  else
    info "AI monitor metrics reachable"
  fi
else
  warn "AI monitor check skipped"
fi

l1_finality_oracle_rpc=""

if [ "$SKIP_CASCADING_ORACLE_CHECK" != "1" ]; then
  info "cascading finality oracle deployment check"
  l1_finality_oracle_address="${L1_FINALITY_ORACLE_ADDRESS:-$(read_stack_env_value L1_FINALITY_ORACLE_ADDRESS)}"
  l2_finality_oracle_address="${L2_FINALITY_ORACLE_ADDRESS:-$(read_stack_env_value L2_FINALITY_ORACLE_ADDRESS)}"
  l3_finality_oracle_address="${L3_FINALITY_ORACLE_ADDRESS:-$(read_stack_env_value L3_FINALITY_ORACLE_ADDRESS)}"

  l1_finality_oracle_rpc_pref="${L1_FINALITY_ORACLE_RPC:-$(read_stack_env_value L1_FINALITY_ORACLE_RPC)}"
  l2_finality_oracle_rpc_pref="${L2_FINALITY_ORACLE_RPC:-$(read_stack_env_value L2_FINALITY_ORACLE_RPC)}"
  l3_finality_oracle_rpc_pref="${L3_FINALITY_ORACLE_RPC:-$(read_stack_env_value L3_FINALITY_ORACLE_RPC)}"

  for oracle_label in L1 L2 L3; do
    oracle_address_var="$(printf '%s\n' "$oracle_label" | tr '[:upper:]' '[:lower:]')_finality_oracle_address"
    oracle_address="${!oracle_address_var:-}"
    if [ -z "$oracle_address" ]; then
      fail "${oracle_label}_FINALITY_ORACLE_ADDRESS missing (set in ${STACK_ENV_FILE#$ROOT_DIR/})"
    fi
    if ! is_valid_address "$oracle_address" || is_zero_address "$oracle_address"; then
      fail "${oracle_label}_FINALITY_ORACLE_ADDRESS invalid: $oracle_address"
    fi
  done

  l1_finality_oracle_rpc="$(resolve_contract_rpc "$l1_finality_oracle_address" "$l1_finality_oracle_rpc_pref" || true)"
  l2_finality_oracle_rpc="$(resolve_contract_rpc "$l2_finality_oracle_address" "$l2_finality_oracle_rpc_pref" || true)"
  l3_finality_oracle_rpc="$(resolve_contract_rpc "$l3_finality_oracle_address" "$l3_finality_oracle_rpc_pref" || true)"

  [ -n "$l1_finality_oracle_rpc" ] || fail "L1FinalityOracle not deployed at $l1_finality_oracle_address on known RPC endpoints"
  [ -n "$l2_finality_oracle_rpc" ] || fail "L2FinalityOracle not deployed at $l2_finality_oracle_address on known RPC endpoints"
  [ -n "$l3_finality_oracle_rpc" ] || fail "L3FinalityOracle not deployed at $l3_finality_oracle_address on known RPC endpoints"

  info "L1FinalityOracle deployed: $l1_finality_oracle_address (rpc $l1_finality_oracle_rpc)"
  info "L2FinalityOracle deployed: $l2_finality_oracle_address (rpc $l2_finality_oracle_rpc)"
  info "L3FinalityOracle deployed: $l3_finality_oracle_address (rpc $l3_finality_oracle_rpc)"
else
  warn "cascading oracle deployment check skipped"
fi

if [ "$SKIP_POLICY_HASH_COMMIT" != "1" ]; then
  info "AI policy hash commitment check"
  ai_policy_hash="${AI_POLICY_HASH:-$(read_stack_env_value AI_POLICY_HASH)}"
  if [ -z "$ai_policy_hash" ]; then
    if is_production_mode; then
      fail "AI_POLICY_HASH missing for production go-live gate"
    fi
    warn "AI_POLICY_HASH missing; policy commitment check downgraded in non-production mode"
  elif ! is_valid_bytes32 "$ai_policy_hash"; then
    fail "AI_POLICY_HASH must be 32-byte hex (got: $ai_policy_hash)"
  else
    if [ -z "$l1_finality_oracle_rpc" ] || [ -z "${l1_finality_oracle_address:-}" ]; then
      fail "cannot verify AI policy hash: L1 finality oracle context unresolved"
    fi
    if ! command -v cast >/dev/null 2>&1; then
      if is_production_mode; then
        fail "cast not installed; cannot verify acceptedPolicyHash on L1FinalityOracle"
      fi
      warn "cast not installed; skipping on-chain policy hash verification in non-production mode"
    else
      policy_accepted="$(
        cast call "$l1_finality_oracle_address" "acceptedPolicyHash(bytes32)(bool)" "$ai_policy_hash" \
          --rpc-url "$l1_finality_oracle_rpc" 2>/dev/null || true
      )"
      if [ "$policy_accepted" != "true" ]; then
        fail "AI policy hash not accepted by L1FinalityOracle ($ai_policy_hash)"
      fi
      info "AI policy hash accepted by L1FinalityOracle: $ai_policy_hash"
    fi
  fi
else
  warn "AI policy hash commitment check skipped"
fi

if [ "$SKIP_GOVERNANCE_APPROVAL" != "1" ]; then
  info "governance approval check"
  governance_vote_approved="${GOVERNANCE_VOTE_APPROVED:-$(read_stack_env_value GOVERNANCE_VOTE_APPROVED)}"
  if is_truthy "$governance_vote_approved"; then
    info "Governance vote approved flag is set"
  elif is_production_mode; then
    fail "GOVERNANCE_VOTE_APPROVED is not set for production go-live gate"
  else
    warn "GOVERNANCE_VOTE_APPROVED not set; tolerated in non-production mode"
  fi
else
  warn "governance approval check skipped"
fi

if [ "$SKIP_POLICY_REGISTRY" != "1" ]; then
  info "policy registry check"
  policy_addr="$(resolve_policy_registry_address)"
  if [ -z "$policy_addr" ] || [ "$policy_addr" = "0x0000000000000000000000000000000000000000" ]; then
    fail "policy registry address missing (set POLICY_REGISTRY_ADDRESS or AGENT_POLICY_CONTRACT in services/stack.env)"
  fi
  policy_rpc="$(resolve_policy_registry_rpc)"
  code_json="$(get_code "$policy_rpc" "$policy_addr")"
  code_hex="$(printf '%s' "$code_json" | python3 -c 'import json,sys; data=json.load(sys.stdin); print(data.get("result",""))')"
  if [ -z "$code_hex" ] || [ "$code_hex" = "0x" ]; then
    fail "policy registry not deployed at $policy_addr"
  fi
  info "policy registry deployed: $policy_addr (rpc $policy_rpc)"
else
  warn "policy registry check skipped"
fi

if [ "$SKIP_CASCADING_FINALITY" != "1" ]; then
  info "cascading finality validation tests"
  if command -v forge >/dev/null 2>&1; then
    (
      cd "$ROOT_DIR/contracts"
      forge test --match-path test/foundry/CascadingFinalityOracles.t.sol >/dev/null
      forge test --match-path test/foundry/L2L3BridgeCascadingFinality.t.sol >/dev/null
      forge test --match-path test/foundry/GhostChainBridgeHub.t.sol >/dev/null
    )
    info "cascading finality tests passed"
  elif is_production_mode; then
    fail "forge not installed; cannot run cascading finality validation tests"
  else
    warn "forge not installed; skipping cascading finality validation tests in non-production mode"
  fi
else
  warn "cascading finality validation tests skipped"
fi

if [ "$SKIP_INVARIANTS" != "1" ]; then
  info "invariant tests"
  if command -v npm >/dev/null 2>&1 && [ -f "$ROOT_DIR/contracts/package.json" ]; then
    npm --prefix "$ROOT_DIR/contracts" run test:invariant
  else
    fail "npm or contracts package missing; cannot run invariant tests"
  fi
else
  warn "invariant tests skipped"
fi

if [ "$SKIP_EVIDENCE" != "1" ]; then
  info "evidence pack generation"
  evidence_out="$($ROOT_DIR/infra/scripts/evidence-pack-l1.sh)"
  if ! echo "$evidence_out" | grep -q "Evidence pack created:"; then
    fail "evidence pack generation failed"
  fi
  info "$evidence_out"
else
  warn "evidence pack generation skipped"
fi

if [ "$SKIP_VULN_SCAN" != "1" ]; then
  info "vulnerability scan"
  if command -v trivy >/dev/null 2>&1; then
    # This gate is expected to run in restricted environments; default to offline usage of the cached Trivy DB.
    trivy_cmd=(trivy fs --scanners vuln,secret --exit-code 1 --severity HIGH,CRITICAL --ignore-unfixed --skip-db-update --skip-version-check --timeout 30m "$ROOT_DIR")
    if [ -n "$TRIVY_SKIP_DIRS" ]; then
      trivy_cmd+=(--skip-dirs "$TRIVY_SKIP_DIRS")
    fi
    if [ -n "$TRIVY_SKIP_FILES" ]; then
      trivy_cmd+=(--skip-files "$TRIVY_SKIP_FILES")
    fi
    if [ -f "$TRIVY_SECRET_CONFIG" ]; then
      trivy_cmd+=(--secret-config "$TRIVY_SECRET_CONFIG")
    fi
    "${trivy_cmd[@]}"
    if [ "$TRIVY_IMAGE_SCAN" = "1" ]; then
      info "vulnerability scan (container images)"
      if [ "$DOCKER_AVAILABLE" != "1" ]; then
        warn "image scan skipped (docker daemon/socket unavailable)"
      else
        if ! "$ROOT_DIR/infra/scripts/security/trivy-image-scan.sh" "${ROOT_DIR}/infra/docker/compose/docker-compose.core.yml"; then
          if [ "$STRICT_MODE" = "1" ]; then
            fail "container image vulnerability scan failed"
          fi
          warn "container image vulnerability scan failed; continuing in non-strict mode"
        fi
      fi
    fi
  else
    fail "trivy not installed (set SKIP_VULN_SCAN=1 only if exceptions are documented)"
  fi
else
  warn "vulnerability scan skipped"
fi

info "L1 go/no-go gates passed"
