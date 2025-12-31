#!/usr/bin/env bash
set -euo pipefail
cd /workspaces/ghostl-stack/.devcontainer
docker compose down -v
docker volume rm -f ghostl-stack_ghostl2_data ghostl-stack_ghostl3_data 2>/dev/null || true
echo "Reset complete."
