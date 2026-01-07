#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

echo "Stopping services (Guard/Relayer/Proposers/Challengers/Obs)..."
cd "$ROOT/.devcontainer"
docker compose stop --no-deps \
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
