#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ENV_FILE="${L3_ENV_FILE:-$ROOT_DIR/infra/opstack/.env.l3}"
SECRETS_FILE="${L3_SECRETS_FILE:-$ROOT_DIR/infra/opstack/.env.secrets}"

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi
if [ -f "$SECRETS_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$SECRETS_FILE"
  set +a
fi

HOST_L3_RPC="${HOST_L3_RPC:-${L3_RPC:-http://localhost:39545}}"
PARENT_L2_RPC="${PARENT_L2_RPC:-http://localhost:29547}"
AI_MONITOR_URL="${AI_MONITOR_L3_URL:-http://localhost:7577/health}"
POLICY_REGISTRY_ADDRESS="${POLICY_REGISTRY_ADDRESS:-}"
POLICY_REGISTRY_RPC="${POLICY_REGISTRY_RPC:-$PARENT_L2_RPC}"
CHAIN_POLICY_REGISTRY_ADDRESS="${CHAIN_POLICY_REGISTRY_ADDRESS:-}"
CHAIN_POLICY_REGISTRY_RPC="${CHAIN_POLICY_REGISTRY_RPC:-$POLICY_REGISTRY_RPC}"
L3_GO_NO_GO_LOAD_SECONDS="${L3_GO_NO_GO_LOAD_SECONDS:-10}"
L3_GO_NO_GO_RESTART_CHECK="${L3_GO_NO_GO_RESTART_CHECK:-0}"
L3_GO_NO_GO_REQUIRE_SCANS="${L3_GO_NO_GO_REQUIRE_SCANS:-0}"
L3_GO_NO_GO_REQUIRE_PROGRESS="${L3_GO_NO_GO_REQUIRE_PROGRESS:-}"
L3_GO_NO_GO_SKIP_RUNTIME="${L3_GO_NO_GO_SKIP_RUNTIME:-0}"

fail() { echo "FAIL: $*" >&2; exit 1; }
warn() { echo "WARN: $*" >&2; }

jsonrpc() {
  local url="$1"
  local method="$2"
  curl -fsS -X POST "$url" -H 'content-type: application/json' \
    --data "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"${method}\",\"params\":[]}" || return 1
}

echo "[l3-go-no-go] starting"

command -v curl >/dev/null 2>&1 || fail "curl missing"

echo "[l3-go-no-go] doctor"
effective_env="$(printf '%s' "${STACK_ENV:-${L3_ENV:-dev}}" | tr '[:upper:]' '[:lower:]')"
if [ -z "$L3_GO_NO_GO_REQUIRE_PROGRESS" ]; then
  case "$effective_env" in
    prod|production|staging) L3_GO_NO_GO_REQUIRE_PROGRESS=1 ;;
    *) L3_GO_NO_GO_REQUIRE_PROGRESS=0 ;;
  esac
fi

if [ "$L3_GO_NO_GO_SKIP_RUNTIME" = "1" ]; then
  if [ -z "${L3_DOCTOR_SKIP_RUNTIME:-}" ]; then
    export L3_DOCTOR_SKIP_RUNTIME=1
  fi
  warn "runtime checks skipped (L3_GO_NO_GO_SKIP_RUNTIME=1)"
fi

if ! docker version --format '{{.Server.Version}}' >/dev/null 2>&1; then
  if [ -z "${L3_DOCTOR_SKIP_DOCKER:-}" ]; then
    export L3_DOCTOR_SKIP_DOCKER=1
  fi
fi

if [ "$L3_GO_NO_GO_REQUIRE_PROGRESS" = "1" ]; then
  L3_REQUIRE_L3_PROGRESS=1 "$ROOT_DIR/infra/scripts/doctor-l3.sh"
else
  "$ROOT_DIR/infra/scripts/doctor-l3.sh"
fi

if [ "$L3_GO_NO_GO_SKIP_RUNTIME" != "1" ]; then
  echo "[l3-go-no-go] rpc stability"
  for i in $(seq 1 "$L3_GO_NO_GO_LOAD_SECONDS"); do
    jsonrpc "$HOST_L3_RPC" "eth_blockNumber" >/dev/null || fail "L3 RPC unstable"
    sleep 1
  done

  echo "[l3-go-no-go] parent l2 rpc"
  jsonrpc "$PARENT_L2_RPC" "eth_chainId" >/dev/null || fail "Parent L2 RPC unreachable"

  echo "[l3-go-no-go] ai monitor"
  curl -fsS "$AI_MONITOR_URL" >/dev/null || warn "AI monitor not reachable"

  echo "[l3-go-no-go] policy registry"
  if [ -z "$POLICY_REGISTRY_ADDRESS" ]; then
    warn "policy registry address missing"
  else
    if ! jsonrpc "$POLICY_REGISTRY_RPC" "eth_chainId" >/dev/null; then
      fail "policy registry RPC unreachable"
    fi
  fi

  echo "[l3-go-no-go] chain policy registry"
  if [ -n "$CHAIN_POLICY_REGISTRY_ADDRESS" ]; then
    if ! jsonrpc "$CHAIN_POLICY_REGISTRY_RPC" "eth_chainId" >/dev/null; then
      fail "chain policy registry RPC unreachable"
    fi
  fi
fi

echo "[l3-go-no-go] invariants"
if [ -x "$ROOT_DIR/contracts/node_modules/.bin/forge" ]; then
  (cd "$ROOT_DIR/contracts" && npm run test:invariant >/dev/null)
else
  warn "forge not installed; skipping invariant tests"
fi

echo "[l3-go-no-go] evidence pack"
if [ -x "$ROOT_DIR/infra/scripts/evidence-pack-l3.sh" ]; then
  "$ROOT_DIR/infra/scripts/evidence-pack-l3.sh" >/dev/null
else
  warn "evidence-pack-l3.sh missing"
fi

if [ "$L3_GO_NO_GO_REQUIRE_SCANS" = "1" ]; then
  echo "[l3-go-no-go] vulnerability scans"
  command -v trivy >/dev/null 2>&1 || fail "trivy missing"
  trivy fs --scanners vuln --exit-code 1 --severity HIGH,CRITICAL \
    --skip-dirs **/node_modules,dist,contracts/dist,contracts/artifacts,contracts/cache,contracts/.hardhat-cache,contracts/typechain-types,contracts/proposals,contracts/.foundry-out,contracts/.foundry-cache,contracts/.foundry-out-local,contracts/.foundry-cache-local,artifacts,cache,backups,ops/snapshots,ops/preflight,contracts/out-codex,contracts/cache-codex,infra/ghostchain/data,infra/ghostchain/secrets,infra/opstack/data,infra/opstack/broadcast,infra/opstack/secrets,infra/opstack/l3/secrets,infra/opstack/l3,chains/l2/data,chains/l3/data \
    --skip-files ops/security/trivy-fs.json,contracts/reports/formal/scribble/scribble.json,contracts/artifacts/build-info/*.json,infra/opstack/op-geth/signer/fourbyte/4byte.json \
    "$ROOT_DIR"
fi

if [ "$L3_GO_NO_GO_RESTART_CHECK" = "1" ]; then
  if [ "$L3_GO_NO_GO_SKIP_RUNTIME" = "1" ]; then
    warn "restart resilience check skipped (L3_GO_NO_GO_SKIP_RUNTIME=1)"
  else
    echo "[l3-go-no-go] restart resilience (l3-op-node)"
    docker compose -f "$ROOT_DIR/infra/opstack/docker-compose.l3.yml" restart l3-op-node
    sleep 5
    jsonrpc "$HOST_L3_RPC" "eth_chainId" >/dev/null || fail "L3 RPC did not recover after restart"
  fi
fi

echo "[l3-go-no-go] OK"
