#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="${ROOT_DIR}/scripts/health/preflight-$(date -u +%Y%m%d-%H%M%S)"
mkdir -p "$OUT_DIR"

rg --files -g 'docker-compose*.yml' "$ROOT_DIR" | sort > "$OUT_DIR/compose-files.txt"
rg --files -g '.env*' "$ROOT_DIR" | sort > "$OUT_DIR/env-files.txt"

docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' > "$OUT_DIR/docker-ps.txt" || true
docker compose ls --format json > "$OUT_DIR/compose-ls.json" || true
docker network ls > "$OUT_DIR/docker-networks.txt" || true
docker volume ls > "$OUT_DIR/docker-volumes.txt" || true

echo "Preflight captured at $OUT_DIR"
