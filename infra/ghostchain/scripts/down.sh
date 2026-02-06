#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "[down] Stopping Ghostchain geth stack..."
docker compose -f "$ROOT/docker-compose.l1.yml" down
