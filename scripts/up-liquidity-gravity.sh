#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/infra/docker/liquidity-gravity/docker-compose.yml"

# shellcheck source=scripts/lib/docker.sh
. "${ROOT_DIR}/scripts/lib/docker.sh"
hg_require_docker_compose

PROFILE_ARGS=()
if [[ "${1:-}" == "--zk" ]]; then
  PROFILE_ARGS+=(--profile zk)
fi

echo "[LGE] Using compose file: ${COMPOSE_FILE}"
echo "[LGE] Safety: this script will NOT remove volumes or reset chains."

hg_docker compose -f "${COMPOSE_FILE}" "${PROFILE_ARGS[@]}" up -d

echo "[LGE] Up. Check:"
echo "  - Router:    http://localhost:7607/health"
if [[ "${1:-}" == "--zk" ]]; then
  echo "  - Prover:    http://localhost:7611/health"
fi
echo "  - Prometheus http://localhost:9090"
echo "  - Grafana    http://localhost:3000 (admin/${GRAFANA_ADMIN_PASSWORD:-admin})"
