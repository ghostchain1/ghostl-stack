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

echo "Stopping OP Stack devnet..."
cd "$ROOT/infra/opstack"
docker compose down >/dev/null 2>&1 || true

echo "Down complete."
