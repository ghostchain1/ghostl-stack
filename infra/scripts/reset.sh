#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

echo "Stopping services..."
bash "$ROOT/infra/scripts/down.sh"

echo "Resetting OP Stack data dirs..."
bash "$ROOT/infra/scripts/opstack/reset.sh"

echo "Reset complete. Re-run: bash infra/scripts/up.sh"
