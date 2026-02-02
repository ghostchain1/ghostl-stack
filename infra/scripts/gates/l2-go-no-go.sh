#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ENV_FILE="${L2_ENV_FILE:-$ROOT_DIR/infra/opstack/.env}"
SECRETS_FILE="${L2_SECRETS_FILE:-$ROOT_DIR/infra/opstack/.env.secrets}"

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

HOST_L2_RPC="${HOST_L2_RPC:-http://localhost:29547}"
HOST_L1_RPC="${HOST_L1_RPC:-http://localhost:18545}"
AI_MONITOR_URL="${AI_MONITOR_URL:-http://localhost:7575/health}"
POLICY_REGISTRY_ADDRESS="${POLICY_REGISTRY_ADDRESS:-}"
POLICY_REGISTRY_RPC="${POLICY_REGISTRY_RPC:-$HOST_L1_RPC}"
L2_GO_NO_GO_LOAD_SECONDS="${L2_GO_NO_GO_LOAD_SECONDS:-10}"
L2_GO_NO_GO_RESTART_CHECK="${L2_GO_NO_GO_RESTART_CHECK:-0}"
L2_GO_NO_GO_REQUIRE_SCANS="${L2_GO_NO_GO_REQUIRE_SCANS:-0}"

fail() { echo "FAIL: $*" >&2; exit 1; }
warn() { echo "WARN: $*" >&2; }

jsonrpc() {
  local url="$1"
  local method="$2"
  curl -fsS -X POST "$url" -H 'content-type: application/json' \
    --data "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"${method}\",\"params\":[]}" || return 1
}

echo "[l2-go-no-go] starting"

command -v curl >/dev/null 2>&1 || fail "curl missing"

echo "[l2-go-no-go] doctor"
"$ROOT_DIR/infra/scripts/doctor-l2.sh"

echo "[l2-go-no-go] rpc stability"
for i in $(seq 1 "$L2_GO_NO_GO_LOAD_SECONDS"); do
  jsonrpc "$HOST_L2_RPC" "eth_blockNumber" >/dev/null || fail "L2 RPC unstable"
  sleep 1
done

echo "[l2-go-no-go] l1 rpc"
jsonrpc "$HOST_L1_RPC" "eth_chainId" >/dev/null || fail "L1 RPC unreachable"

echo "[l2-go-no-go] ai monitor"
curl -fsS "$AI_MONITOR_URL" >/dev/null || fail "AI monitor not reachable"

echo "[l2-go-no-go] governance policy registry"
if [ -z "$POLICY_REGISTRY_ADDRESS" ]; then
  warn "policy registry address missing"
else
  if ! jsonrpc "$POLICY_REGISTRY_RPC" "eth_chainId" >/dev/null; then
    fail "policy registry RPC unreachable"
  fi
fi

echo "[l2-go-no-go] invariants"
if [ -x "$ROOT_DIR/contracts/node_modules/.bin/forge" ]; then
  (cd "$ROOT_DIR/contracts" && npm run test:invariant >/dev/null)
else
  warn "forge not installed; skipping invariant tests"
fi

echo "[l2-go-no-go] evidence pack"
if [ -x "$ROOT_DIR/infra/scripts/evidence-pack-l2.sh" ]; then
  "$ROOT_DIR/infra/scripts/evidence-pack-l2.sh" >/dev/null
else
  warn "evidence-pack-l2.sh missing"
fi

if [ "$L2_GO_NO_GO_REQUIRE_SCANS" = "1" ]; then
  echo "[l2-go-no-go] vulnerability scans"
  command -v trivy >/dev/null 2>&1 || fail "trivy missing"
  trivy fs --scanners vuln --exit-code 1 --severity HIGH,CRITICAL \
    --skip-dirs node_modules,contracts/node_modules,dist,artifacts,cache,backups,ops/snapshots,ops/preflight,contracts/out-codex,contracts/cache-codex,infra/ghostchain/data \
    --skip-files contracts/reports/formal/scribble/scribble.json,contracts/artifacts/build-info/*.json,infra/opstack/op-geth/signer/fourbyte/4byte.json \
    "$ROOT_DIR"
fi

if [ "$L2_GO_NO_GO_RESTART_CHECK" = "1" ]; then
  echo "[l2-go-no-go] restart resilience (op-node)"
  docker compose -f "$ROOT_DIR/infra/opstack/docker-compose.yml" restart op-node
  sleep 5
  jsonrpc "$HOST_L2_RPC" "eth_chainId" >/dev/null || fail "L2 RPC did not recover after restart"
fi

echo "[l2-go-no-go] OK"
