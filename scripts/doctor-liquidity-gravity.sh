#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/infra/docker/liquidity-gravity/docker-compose.yml"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker not found"
  exit 1
fi

echo "[LGE] Compose services:"
docker compose -f "${COMPOSE_FILE}" ps

echo "[LGE] Health checks:"
curl -fsS "http://localhost:7607/health" | jq -r '.' 2>/dev/null || curl -fsS "http://localhost:7607/health" || true
curl -fsS "http://localhost:7611/health" >/dev/null 2>&1 && echo "prover ok" || echo "prover not running (ok if zk profile disabled)"
curl -fsS "http://localhost:9090/-/ready" >/dev/null && echo "prometheus ok" || echo "prometheus not ready"
curl -fsS "http://localhost:3000/api/health" >/dev/null && echo "grafana ok" || echo "grafana not ready"
