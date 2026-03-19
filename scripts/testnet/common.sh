#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ARTIFACT_DIR="${ARTIFACT_DIR:-$ROOT_DIR/artifacts/testnet}"
mkdir -p "$ARTIFACT_DIR"

# The canonical Ghost-native bring-up path is GhostChain L1 + custom rollup services.
export COMPOSE_PROFILES="${COMPOSE_PROFILES:-}"
export GHOSTCHAIN_PATH_PREFIX="${GHOSTCHAIN_PATH_PREFIX:-./infra/ghostchain}"
export GHOST_RPC_PROXY_BUILD_CONTEXT="${GHOST_RPC_PROXY_BUILD_CONTEXT:-$ROOT_DIR/services/ghost-rpc-proxy}"
export GETH_IMAGE="${GETH_IMAGE:-ghostchain/ghost-geth:v1.13.14}"
export L1_UID="${L1_UID:-$(id -u)}"
export L1_GID="${L1_GID:-$(id -g)}"
export L1_GHOSTCHAIN_SUBNET="${L1_GHOSTCHAIN_SUBNET:-10.89.0.0/24}"
export L1_GHOSTCHAIN_GATEWAY_IP="${L1_GHOSTCHAIN_GATEWAY_IP:-10.89.0.1}"
export L1_GHOSTCHAIN_BOOTNODE_IP="${L1_GHOSTCHAIN_BOOTNODE_IP:-10.89.0.21}"
export L1_GHOSTCHAIN_NODE1_IP="${L1_GHOSTCHAIN_NODE1_IP:-10.89.0.22}"
export L1_GHOSTCHAIN_NODE2_IP="${L1_GHOSTCHAIN_NODE2_IP:-10.89.0.23}"
export L1_GHOSTCHAIN_RPC_PROXY_IP="${L1_GHOSTCHAIN_RPC_PROXY_IP:-10.89.0.30}"
export L1_GHOSTCHAIN_GHOSTSCOUT_IP="${L1_GHOSTCHAIN_GHOSTSCOUT_IP:-10.89.0.31}"
export RPC_L1="${RPC_L1:-http://localhost:18545}"
export RPC_L2="${RPC_L2:-http://localhost:29547}"
export RPC_L3="${RPC_L3:-http://localhost:39545}"
export L3_PARENT_L2_RPC="${L3_PARENT_L2_RPC:-$RPC_L2}"
export GHOST_L1_RPC_INTERNAL="${GHOST_L1_RPC_INTERNAL:-http://host.docker.internal:18545}"
export GHOST_L2_EXEC_RPC_URL="${GHOST_L2_EXEC_RPC_URL:-http://host.docker.internal:29547}"
export GHOST_L3_EXEC_RPC_URL="${GHOST_L3_EXEC_RPC_URL:-http://host.docker.internal:39545}"

STACK_COMPOSE_FILES=(
  "infra/ghostchain/docker-compose.l1.yml"
  "docker-compose.custom-rollup.yml"
)

if [[ "${INCLUDE_SOVEREIGN:-0}" == "1" ]]; then
  STACK_COMPOSE_FILES+=("docker-compose.sovereign.yml")
fi

if [[ "${INCLUDE_AUTONOMY:-0}" == "1" ]]; then
  STACK_COMPOSE_FILES+=("docker-compose.autonomy.yml")
fi

if [[ -n "${EXTRA_COMPOSE_FILES:-}" ]]; then
  while IFS= read -r f; do
    [[ -n "$f" ]] && STACK_COMPOSE_FILES+=("$f")
  done < <(printf '%s' "$EXTRA_COMPOSE_FILES" | tr ',' '\n')
fi

compose_args=()
for f in "${STACK_COMPOSE_FILES[@]}"; do
  compose_args+=("-f" "$ROOT_DIR/$f")
done

compose_cmd() {
  docker compose --project-directory "$ROOT_DIR" "${compose_args[@]}" "$@"
}

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "[testnet] missing required command: $cmd" >&2
    exit 1
  fi
}

rpc_ready() {
  local url="$1"
  local response
  local method
  for method in ghost_chainId eth_chainId; do
    response="$(curl -fsS -m 3 -H 'content-type: application/json' \
      --data "{\"jsonrpc\":\"2.0\",\"method\":\"${method}\",\"params\":[],\"id\":1}" \
      "$url" 2>/dev/null || true)"
    if [[ "$response" == *'"result"'* ]]; then
      return 0
    fi
  done
  return 1
}

wait_for_rpc() {
  local name="$1"
  local url="$2"
  local attempts="${3:-30}"
  local delay_seconds="${4:-2}"
  local i
  echo "[wait] ${name}: ${url}"
  for i in $(seq 1 "$attempts"); do
    if rpc_ready "$url"; then
      return 0
    fi
    sleep "$delay_seconds"
  done
  echo "[wait] FAIL ${name} not reachable at ${url}" >&2
  return 1
}

wait_for_http() {
  local name="$1"
  local url="$2"
  local attempts="${3:-30}"
  local delay_seconds="${4:-2}"
  local i
  echo "[wait] ${name}: ${url}"
  for i in $(seq 1 "$attempts"); do
    if curl -fsS -m 5 "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep "$delay_seconds"
  done
  echo "[wait] FAIL ${name} endpoint not ready at ${url}" >&2
  return 1
}
