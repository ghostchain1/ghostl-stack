#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

cd "$ROOT/.devcontainer"
docker compose down -v
echo "Removing chain data..."
bash "$ROOT/infra/scripts/chains/reset.sh"
echo "Reset complete."
