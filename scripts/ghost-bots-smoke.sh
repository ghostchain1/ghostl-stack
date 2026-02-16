#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[ghost-bots-smoke] python syntax check"
python3 -m py_compile \
  ops/ghost-bots/core/*.py \
  ops/ghost-bots/plugins/*.py \
  ops/ghost-bots/dashboards/*.py

echo "[ghost-bots-smoke] verify_patch non-runtime smoke"
python3 ops/ghost-bots/plugins/verify_patch.py \
  --patch-id 0 \
  --skip-service-tests \
  --skip-forge \
  --skip-rpc-smoke \
  --skip-compose \
  --gate-timeout-seconds 60 \
  --service-test-timeout-seconds 60 \
  --forge-timeout-seconds 60

echo "[ghost-bots-smoke] orchestrator non-runtime smoke"
GHOST_BOTS_SKIP_DOCKER_HEALTH=1 \
GHOST_BOTS_SKIP_RPC_HEALTH=1 \
python3 ops/ghost-bots/core/orchestrator.py --once

echo "[ghost-bots-smoke] done"
