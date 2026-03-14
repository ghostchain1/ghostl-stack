#!/usr/bin/env bash
set -Eeuo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

require_cmd docker

compose_cmd build

if [[ -f "$ROOT_DIR/apps/web/package.json" ]]; then
  (
    cd "$ROOT_DIR/apps/web"
    npm ci
    npm run build
  )
fi

if [[ -f "$ROOT_DIR/contracts/foundry.toml" ]]; then
  (
    cd "$ROOT_DIR/contracts"
    forge test -q
  )
fi

echo "[build] PASS"
