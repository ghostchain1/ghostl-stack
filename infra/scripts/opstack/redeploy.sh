#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OP_DIR="$ROOT/infra/opstack"
CFG_DIR="$OP_DIR/config"

echo ">> Verifying rollup/genesis checksums..."
if ! (cd "$CFG_DIR" && sha256sum -c checksums.txt); then
  echo "Checksum validation failed. Update $CFG_DIR/checksums.txt after regenerating configs." >&2
  exit 1
fi

echo ">> Stopping OP Stack devnet..."
cd "$OP_DIR"
docker compose down -v || true

echo ">> Resetting data dirs..."
rm -rf "$OP_DIR/data/l2-geth" "$OP_DIR/data/op-node" "$OP_DIR/data/op-sequencer"
mkdir -p "$OP_DIR/data/l2-geth" "$OP_DIR/data/op-node" "$OP_DIR/data/op-sequencer"

echo ">> Starting stack..."
bash "$ROOT/infra/scripts/opstack/up.sh"

echo ">> Deploying contracts..."
bash "$ROOT/infra/scripts/opstack/deploy.sh"

echo "Redeploy complete."
