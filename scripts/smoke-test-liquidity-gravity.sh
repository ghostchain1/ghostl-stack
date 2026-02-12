#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "[LGE] Running Foundry unit + fuzz tests (targeted)..."
(
  cd "${ROOT_DIR}/contracts"
  forge test --match-path 'test/foundry/*LiquidityGravityEngine*.t.sol'
)

echo "[LGE] CLI status (requires contracts deployed + addresses in services/stack.env):"
node --experimental-strip-types "${ROOT_DIR}/tools/liquidityctl/src/cli.ts" status --env-file "${ROOT_DIR}/services/stack.env" || true

echo "[LGE] Smoke test complete."

