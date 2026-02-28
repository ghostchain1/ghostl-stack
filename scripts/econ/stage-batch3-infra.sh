#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

git reset
git add -- \
  docker-compose.econ.devnet.yml \
  docker-compose.econ.testnet.yml \
  docker-compose.econ.mainnet.yml \
  observability/prometheus/prometheus-econ.yml \
  observability/prometheus/rules/econ-engine.rules.yml \
  observability/grafana/dashboards/econ-engine-overview.json

echo "[batch3] staged files:"
git diff --cached --name-only | sort
echo
echo "[batch3] suggested commit message:"
echo "feat(econ-infra): add devnet/testnet/mainnet compose overlays and econ observability"
