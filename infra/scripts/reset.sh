#!/usr/bin/env bash
set -euo pipefail
cd/home/ghost/ghostl-stack//.devcontainer
docker compose down -v
echo "Removing chain data..."
bash/home/ghost/ghostl-stack//infra/scripts/chains/reset.sh
echo "Reset complete."
