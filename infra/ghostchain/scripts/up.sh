#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT/../.." && pwd)"

# shellcheck source=scripts/lib/docker.sh
. "${REPO_ROOT}/scripts/lib/docker.sh"
hg_require_docker_compose

bash "$ROOT/../scripts/env-sync-l1.sh"
bash "$ROOT/scripts/init.sh"

echo "[up] Starting Ghostchain geth stack..."
hg_docker compose -f "$ROOT/docker-compose.l1.yml" up -d
hg_docker compose -f "$ROOT/docker-compose.l1.yml" ps
