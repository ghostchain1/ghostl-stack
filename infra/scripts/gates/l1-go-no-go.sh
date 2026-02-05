#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
L1_ENV_FILE="${L1_ENV_FILE:-$ROOT_DIR/infra/ghostchain/.env.l1}"

if [ -f "$L1_ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$L1_ENV_FILE"
  set +a
fi

HOST_L1_RPC="${HOST_L1_RPC:-http://localhost:18545}"
L1_METRICS_PROM_URL="${L1_METRICS_PROM_URL:-http://localhost:18660/debug/metrics/prometheus}"
PROMETHEUS_URL="${PROMETHEUS_URL:-http://localhost:9090}"
L1_METRICS_PROM_TARGET="${L1_METRICS_PROM_TARGET:-http://host.docker.internal:18660/debug/metrics/prometheus}"
AI_MONITOR_HEALTH_URL="${AI_MONITOR_HEALTH_URL:-http://localhost:7576/health}"
AI_MONITOR_METRICS_URL="${AI_MONITOR_METRICS_URL:-http://localhost:7576/metrics}"
POLICY_REGISTRY_ENV_FILE="${POLICY_REGISTRY_ENV_FILE:-$ROOT_DIR/services/stack.env}"
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

TRIVY_SECRET_CONFIG="${TRIVY_SECRET_CONFIG:-$ROOT_DIR/trivy-secret.yaml}"
TRIVY_SKIP_DIRS_DEFAULT="node_modules,contracts/node_modules,dist,contracts/dist,contracts/artifacts,contracts/cache,contracts/.hardhat-cache,contracts/typechain-types,contracts/proposals,contracts/.foundry-out,contracts/.foundry-cache,contracts/.foundry-out-local,contracts/.foundry-cache-local,artifacts,cache,backups,ops/snapshots,ops/preflight,contracts/out-codex,contracts/cache-codex,contracts/out-slither,contracts/cache-slither,infra/docker/_backup,infra/docker/audit,infra/docker/runtime,infra/ghostchain/data,infra/ghostchain/secrets,infra/opstack/data,infra/opstack/broadcast,infra/opstack/secrets,infra/opstack/l3/secrets,chains/l2/data,chains/l3/data"
TRIVY_SKIP_FILES_DEFAULT=".env,**/.env,**/.env.*,ops/security/trivy-fs.json,contracts/reports/formal/scribble/scribble.json,contracts/artifacts/build-info/*.json,infra/opstack/op-geth/signer/fourbyte/4byte.json"
TRIVY_SKIP_DIRS="${TRIVY_SKIP_DIRS:-$TRIVY_SKIP_DIRS_DEFAULT}"
TRIVY_SKIP_FILES="${TRIVY_SKIP_FILES:-$TRIVY_SKIP_FILES_DEFAULT}"

warn() { echo "WARN: $*" >&2; }
fail() { echo "FAIL: $*" >&2; exit 1; }
info() { echo "[gate] $*"; }

need_bin() {
  command -v "$1" >/dev/null 2>&1 || fail "missing required binary: $1"
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
  grep -E "^${key}=" "$file" | tail -n1 | cut -d= -f2- | tr -d '\"'
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
  cid="$(docker compose -f "$compose_file" ps -q "$service" 2>/dev/null || true)"
  if [ -z "$cid" ]; then
    fail "service $service not running for compose $compose_file"
  fi
  local policy status health
  policy="$(docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' "$cid" 2>/dev/null || true)"
  status="$(docker inspect -f '{{.State.Status}}' "$cid" 2>/dev/null || true)"
  health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$cid" 2>/dev/null || true)"
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

if ! docker info >/dev/null 2>&1; then
  fail "docker daemon not reachable"
fi
if ! docker compose version >/dev/null 2>&1; then
  fail "docker compose not available"
fi

if ! command -v forge >/dev/null 2>&1; then
  if [ -x "${HOME}/.foundry/bin/forge" ]; then
    export PATH="${HOME}/.foundry/bin:${PATH}"
  fi
fi

info "running doctor-l1"
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
  L1_COMPOSE_FILE="${L1_COMPOSE_FILE:-$ROOT_DIR/infra/ghostchain/docker-compose.eth.yml}"
  check_restart_policy "$L1_COMPOSE_FILE" "ghostchain-node1"
  check_restart_policy "$L1_COMPOSE_FILE" "ghostchain-rpc-proxy"
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
    trivy_cmd=(trivy fs --scanners vuln,secret --exit-code 1 --severity HIGH,CRITICAL --ignore-unfixed "$ROOT_DIR")
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
  else
    fail "trivy not installed (set SKIP_VULN_SCAN=1 only if exceptions are documented)"
  fi
else
  warn "vulnerability scan skipped"
fi

info "L1 go/no-go gates passed"
