#!/usr/bin/env bash
set -euo pipefail

cd /workspaces/ghostl-stack/contracts
if [ ! -f package.json ]; then
  echo "contracts package.json missing (did you create files?)"
  exit 1
fi
npm install

cd /workspaces/ghostl-stack/services/ghost-guard
npm install

echo "Deps installed."
