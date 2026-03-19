#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# shellcheck source=scripts/lib/docker.sh
. "${ROOT}/scripts/lib/docker.sh"
hg_require_docker_compose

compose_down() {
  local compose_file="$1"

  if [[ ! -f "$compose_file" ]]; then
    return 0
  fi

  case "$compose_file" in
    "$ROOT/docker-compose.yml")
      (
        export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-ghost-local}"
        export COMPLIANCE_JWT_SECRET="${COMPLIANCE_JWT_SECRET:-ghost-local}"
        hg_docker compose -f "$compose_file" down --remove-orphans >/dev/null 2>&1 || true
      )
      ;;
    "$ROOT/docker-compose.dev.yml")
      (
        export GAS_ENGINE_ADMIN_TOKEN="${GAS_ENGINE_ADMIN_TOKEN:-ghost-local}"
        hg_docker compose -f "$compose_file" down --remove-orphans >/dev/null 2>&1 || true
      )
      ;;
    "$ROOT/docker-compose.phase3.yml")
      (
        export COMPOSE_PROFILES="${COMPOSE_PROFILES:+$COMPOSE_PROFILES,}interchain"
        hg_docker compose -f "$compose_file" down --remove-orphans >/dev/null 2>&1 || true
      )
      ;;
    *)
      hg_docker compose -f "$compose_file" down --remove-orphans >/dev/null 2>&1 || true
      ;;
  esac
}

echo "Stopping Ghost-native apps, services, and chains..."
compose_down "$ROOT/docker-compose.dev.yml"
compose_down "$ROOT/docker-compose.sovereign.yml"
compose_down "$ROOT/docker-compose.phase3.yml"
compose_down "$ROOT/observability/infra/docker-compose.yml"
compose_down "$ROOT/docker-compose.yml"
compose_down "$ROOT/docker-compose.custom-rollup.yml"
compose_down "$ROOT/infra/ghostchain/docker-compose.l1.yml"

echo "Down complete."
