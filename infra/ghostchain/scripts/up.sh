#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

bash "$ROOT/../scripts/env-sync-l1.sh"
bash "$ROOT/scripts/init.sh"

echo "[up] Starting Ghostchain geth stack..."
docker compose -f "$ROOT/docker-compose.l1.yml" up -d
docker compose -f "$ROOT/docker-compose.l1.yml" ps
