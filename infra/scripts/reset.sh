#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# shellcheck source=scripts/lib/docker.sh
. "${ROOT}/scripts/lib/docker.sh"
hg_require_docker_compose

compose_down_volumes() {
  local compose_file="$1"

  if [[ ! -f "$compose_file" ]]; then
    return 0
  fi

  hg_docker compose -f "$compose_file" down -v --remove-orphans >/dev/null 2>&1 || true
}

echo "Stopping Ghost-native stack..."
bash "$ROOT/infra/scripts/down.sh"

echo "Resetting GhostChain / GhostL2 / GhostL3 core state volumes..."
compose_down_volumes "$ROOT/docker-compose.custom-rollup.yml"
compose_down_volumes "$ROOT/infra/ghostchain/docker-compose.l1.yml"

echo "Reset complete. Re-run: bash infra/scripts/up.sh"
