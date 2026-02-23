#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -z "${GHOSTWALLET_MASTER_KEY:-}" ]]; then
  echo "[verify] missing required env: GHOSTWALLET_MASTER_KEY" >&2
  exit 1
fi

echo "[verify] running production build"
npm run build
npm run build -w packages/ghostwallet
npm run build -w apps/api
npm run build -w apps/web
npm run build -w apps/worker

echo "[verify] running production smoke gate"
npm run smoke:stack:prod
