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
fi
hg_docker compose -f "$COMPOSE_FILE" stop --no-deps \
  ghost-guard ghost-relayer \
  ghost-rollup-proposer-l2 ghost-rollup-proposer-l3 \
  ghost-rollup-challenger-l2 ghost-rollup-challenger-l3 \
  ai-monitor \
  prometheus grafana >/dev/null 2>&1 || true

echo "Stopping OP Stack devnet (L1/L2)..."
bash "$ROOT/infra/scripts/opstack/down-l2.sh"

echo "Stopping OP Stack L3..."
bash "$ROOT/infra/scripts/opstack/down-l3.sh" || true

echo "Down complete."
