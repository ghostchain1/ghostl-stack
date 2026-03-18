#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# shellcheck source=scripts/lib/docker.sh
. "${ROOT}/scripts/lib/docker.sh"
hg_require_docker_compose

echo "Stopping services (Guard/Relayer/Proposers/Challengers/Obs)..."
COMPOSE_DIR="$ROOT/.devcontainer"
COMPOSE_FILE="$COMPOSE_DIR/docker-compose.yml"
if [ ! -f "$COMPOSE_FILE" ]; then
  COMPOSE_DIR="$ROOT/services"
  COMPOSE_FILE="$COMPOSE_DIR/docker-compose.yml"
  if [ ! -f "$COMPOSE_FILE" ]; then
    COMPOSE_FILE="$COMPOSE_DIR/docker-compose.legacy.yml"
  fi
fi
COMPOSE_ARGS=(-f "$COMPOSE_FILE")
if [ "$COMPOSE_DIR" = "$ROOT/services" ] && [ -f "$COMPOSE_DIR/stack.env" ]; then
  COMPOSE_ARGS=(--env-file "$COMPOSE_DIR/stack.env" -f "$COMPOSE_FILE")
fi
SERVICES=(
  ghost-guard
  ghost-relayer
  ghost-rollup-proposer
  ghost-rollup-proposer-l2
  ghost-rollup-proposer-l3
  ghost-rollup-challenger
  ghost-rollup-challenger-l2
  ghost-rollup-challenger-l3
  ai-monitor
  prometheus
  grafana
)
available_services="$(hg_docker compose "${COMPOSE_ARGS[@]}" config --services 2>/dev/null || true)"
stop_services=()
for svc in "${SERVICES[@]}"; do
  if printf '%s\n' "$available_services" | grep -qx "$svc"; then
    stop_services+=("$svc")
  fi
done
if [ "${#stop_services[@]}" -gt 0 ]; then
  hg_docker compose "${COMPOSE_ARGS[@]}" stop --no-deps "${stop_services[@]}" >/dev/null 2>&1 || true
fi

echo "Stopping OP Stack devnet (L1/L2)..."
bash "$ROOT/infra/scripts/opstack/down-l2.sh"

echo "Stopping OP Stack L3..."
bash "$ROOT/infra/scripts/opstack/down-l3.sh" || true

echo "Down complete."
