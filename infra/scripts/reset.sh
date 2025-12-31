#!/usr/bin/env bash
set -euo pipefail
cd /workspaces/ghostl-stack/.devcontainer
docker compose down -v
echo "Removing chain data..."
bash /workspaces/ghostl-stack/infra/scripts/chains/reset.sh
echo "Reset complete."
