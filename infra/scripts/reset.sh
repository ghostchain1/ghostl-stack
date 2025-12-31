#!/usr/bin/env bash
set -euo pipefail
cd /workspaces/ghostl-stack/.devcontainer
docker compose down -v
echo "Reset complete."
