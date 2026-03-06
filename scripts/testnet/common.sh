#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ARTIFACT_DIR="${ARTIFACT_DIR:-$ROOT_DIR/artifacts/testnet}"
mkdir -p "$ARTIFACT_DIR"

# L2 op-proposer is currently assigned to profile "disabled" in base compose.
# Default to enabling it for release rehearsal unless operator overrides.
export COMPOSE_PROFILES="${COMPOSE_PROFILES:-disabled}"
# Resolve GhostChain relative paths when compose base file is infra/opstack/docker-compose.yml.
export GHOSTCHAIN_PATH_PREFIX="${GHOSTCHAIN_PATH_PREFIX:-../ghostchain}"
# Use the GhostChain-branded ghost-geth image (wraps go-ethereum alltools, same binaries).
export GETH_IMAGE="${GETH_IMAGE:-ghostchain/ghost-geth:v1.13.14}"
export OPSTACK_UID="${OPSTACK_UID:-$(id -u)}"
export OPSTACK_GID="${OPSTACK_GID:-$(id -g)}"
export L1_UID="${L1_UID:-$(id -u)}"
export L1_GID="${L1_GID:-$(id -g)}"
# Avoid default docker subnet collisions on hosts already using 172.28.0.0/16.
export L1_GHOSTCHAIN_SUBNET="${L1_GHOSTCHAIN_SUBNET:-10.89.0.0/24}"
export L1_GHOSTCHAIN_GATEWAY_IP="${L1_GHOSTCHAIN_GATEWAY_IP:-10.89.0.1}"
export L1_GHOSTCHAIN_BOOTNODE_IP="${L1_GHOSTCHAIN_BOOTNODE_IP:-10.89.0.21}"
export L1_GHOSTCHAIN_NODE1_IP="${L1_GHOSTCHAIN_NODE1_IP:-10.89.0.22}"
export L1_GHOSTCHAIN_NODE2_IP="${L1_GHOSTCHAIN_NODE2_IP:-10.89.0.23}"
export L1_GHOSTCHAIN_RPC_PROXY_IP="${L1_GHOSTCHAIN_RPC_PROXY_IP:-10.89.0.30}"
export L1_GHOSTCHAIN_GHOSTSCOUT_IP="${L1_GHOSTCHAIN_GHOSTSCOUT_IP:-10.89.0.31}"
export L2_GATE_HOST_PORT="${L2_GATE_HOST_PORT:-38546}"
export L1_GATE_HOST_PORT="${L1_GATE_HOST_PORT:-38547}"
export L2_HOST_RPC_PORT="${L2_HOST_RPC_PORT:-49547}"
export L2_HOST_WS="${L2_HOST_WS:-49548}"
export L2_METRICS_HOST_PORT="${L2_METRICS_HOST_PORT:-49606}"
export OP_NODE_HOST_PORT="${OP_NODE_HOST_PORT:-49546}"
export OP_NODE_METRICS_HOST_PORT="${OP_NODE_METRICS_HOST_PORT:-17300}"
export OP_SEQUENCER_HOST_PORT="${OP_SEQUENCER_HOST_PORT:-49646}"
export OP_SEQUENCER_METRICS_HOST_PORT="${OP_SEQUENCER_METRICS_HOST_PORT:-17303}"
export OP_BATCHER_HOST_PORT="${OP_BATCHER_HOST_PORT:-48551}"
export OP_BATCHER_METRICS_HOST_PORT="${OP_BATCHER_METRICS_HOST_PORT:-17301}"
export RPC_FORWARD_L2_HOST_PORT="${RPC_FORWARD_L2_HOST_PORT:-48547}"
export L3_HOST_RPC="${L3_HOST_RPC:-59545}"
export L3_HOST_WS="${L3_HOST_WS:-59548}"
export L3_GETH_METRICS_HOST_PORT="${L3_GETH_METRICS_HOST_PORT:-59606}"
export L3_ROLLUP_RPC_HOST_PORT="${L3_ROLLUP_RPC_HOST_PORT:-59546}"
export L3_METRICS_NODE_HOST_PORT="${L3_METRICS_NODE_HOST_PORT:-18300}"
export L3_BATCHER_HOST_PORT="${L3_BATCHER_HOST_PORT:-59551}"
export L3_METRICS_BATCHER_HOST_PORT="${L3_METRICS_BATCHER_HOST_PORT:-18301}"
export L3_PROPOSER_HOST_PORT="${L3_PROPOSER_HOST_PORT:-59560}"
export L3_METRICS_PROPOSER_HOST_PORT="${L3_METRICS_PROPOSER_HOST_PORT:-18302}"
export RPC_L1="${RPC_L1:-http://localhost:18545}"
export RPC_L2="${RPC_L2:-http://localhost:${L2_HOST_RPC_PORT}}"
export RPC_L3="${RPC_L3:-http://localhost:${L3_HOST_RPC}}"
export L3_PARENT_L2_RPC="${L3_PARENT_L2_RPC:-$RPC_L2}"
# Set optional vars explicitly so compose does not emit noisy "not set" warnings.
export BATCHER_KEY="${BATCHER_KEY-}"
export PROPOSER_KEY="${PROPOSER_KEY-}"
export L3_BATCHER_KEY="${L3_BATCHER_KEY-}"
export L3_PROPOSER_KEY="${L3_PROPOSER_KEY-}"
export L3_DATA_PROFILE="${L3_DATA_PROFILE-}"

STACK_COMPOSE_FILES=(
  "infra/opstack/docker-compose.yml"
  "infra/ghostchain/docker-compose.l1.yml"
  "infra/opstack/docker-compose.l3.yml"
  "compose.testnet.yml"
)

if [[ "${INCLUDE_CHALLENGERS:-0}" == "1" ]]; then
  STACK_COMPOSE_FILES+=("infra/opstack/docker-compose.challengers.yml")
fi

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
  docker compose "${compose_args[@]}" "$@"
}

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "[testnet] missing required command: $cmd" >&2
    exit 1
  fi
}
