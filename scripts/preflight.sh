#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "[preflight] enforcing GST-native leakage gates"
bash "$ROOT_DIR/scripts/gst-leakage-gate.sh"
bash "$ROOT_DIR/scripts/gst-symbol-gate.sh"

echo "[preflight] OK"
