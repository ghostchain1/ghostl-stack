#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

CORE_COMPOSE="$ROOT_DIR/infra/docker/compose/docker-compose.core.yml"
SERVICES_COMPOSE="$ROOT_DIR/infra/docker/compose/docker-compose.services.yml"
UI_COMPOSE="$ROOT_DIR/infra/docker/compose/docker-compose.ui.yml"
OBS_COMPOSE="$ROOT_DIR/infra/docker/compose/docker-compose.obs.yml"
AI_COMPOSE="$ROOT_DIR/infra/docker/compose/docker-compose.ai.yml"

L1_RPC_URL="${L1_RPC_URL:-http://localhost:18545}"
L2_RPC_URL="${L2_RPC_URL:-http://localhost:29547}"
L3_RPC_URL="${L3_RPC_URL:-http://localhost:39545}"
UI_URL="${UI_URL:-http://localhost:3200}"
PROM_URL="${PROM_URL:-http://localhost:9090}"
GRAFANA_URL="${GRAFANA_URL:-http://localhost:3000}"
LOKI_URL="${LOKI_URL:-http://localhost:3100}"

pass() { echo "PASS: $*"; }
fail() { echo "FAIL: $*"; exit 1; }

check_compose() {
  local file="$1"
  if docker compose -f "$file" config --no-path-resolution --no-env-resolution --no-interpolate --no-consistency >/dev/null; then
    pass "compose config ok: $file"
  else
    fail "compose config failed: $file"
  fi
}

check_rpc() {
  local name="$1"
  local url="$2"
  local chain_id
  chain_id=$(curl -s -X POST -H 'Content-Type: application/json' \
    --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' "$url" | jq -r '.result' || true)
  if [[ -n "$chain_id" && "$chain_id" != "null" ]]; then
    pass "$name RPC ok ($url) chainId=$chain_id"
  else
    fail "$name RPC failed ($url)"
  fi
}

check_http() {
  local name="$1"
  local url="$2"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" "$url" || true)
  if [[ "$code" =~ ^2|3 ]]; then
    pass "$name reachable ($url) status=$code"
  else
    fail "$name unreachable ($url) status=$code"
  fi
}

check_chain_containers() {
  local runtime_file="$ROOT_DIR/infra/docker/runtime/runtime-containers.json"
  local running_chain
  running_chain=$(docker ps --format '{{.ID}} {{.Names}}' | rg -i 'geth|op-geth|op-node|sequencer|proposer|batcher|rollup|ghostchain|l2|l3' || true)
  if [[ -z "$running_chain" ]]; then
    fail "no chain containers currently running"
  fi

  if [[ ! -f "$runtime_file" ]]; then
    echo "WARN: runtime snapshot missing, skipping chain container continuity check."
    return 0
  fi

  local ids
  ids=$(jq -r '.inspect[] | select((.Config.Labels["com.docker.compose.service"] // "") | test("geth|op-geth|op-node|sequencer|proposer|batcher|rollup|ghostchain|l2|l3"; "i")) | .Id' "$runtime_file")
  if [[ -z "$ids" ]]; then
    echo "WARN: no chain containers found in runtime snapshot."
    return 0
  fi

  for id in $ids; do
    if docker ps -q --no-trunc | rg -q "$id"; then
      pass "chain container still running: $id"
    else
      echo "WARN: chain container from snapshot not running: $id"
    fi
  done
}

check_compose "$CORE_COMPOSE"
check_compose "$SERVICES_COMPOSE"
check_compose "$UI_COMPOSE"
check_compose "$OBS_COMPOSE"
check_compose "$AI_COMPOSE"

check_rpc "L1" "$L1_RPC_URL"
check_rpc "L2" "$L2_RPC_URL"
check_rpc "L3" "$L3_RPC_URL"

check_http "UI" "$UI_URL"
check_http "Prometheus" "$PROM_URL"
check_http "Grafana" "$GRAFANA_URL"
check_http "Loki" "${LOKI_URL%/}/ready"

check_chain_containers

pass "smoke checks complete"
