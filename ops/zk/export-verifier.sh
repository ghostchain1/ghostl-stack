#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ZKEY_PATH="$ROOT_DIR/ops/zk/keys/immutability_final.zkey"
OUT_PATH="$ROOT_DIR/ops/zk/Verifier.sol"

usage() {
  cat <<'USAGE'
Usage: export-verifier.sh [--zkey <path>] [--out <path>]
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --zkey) ZKEY_PATH="$2"; shift 2;;
    --out) OUT_PATH="$2"; shift 2;;
    -h|--help) usage; exit 0;;
    *) echo "Unknown argument: $1" >&2; exit 1;;
  esac
done

if ! command -v snarkjs >/dev/null 2>&1; then
  echo "snarkjs is required for verifier export." >&2
  exit 1
fi

if [[ ! -f "$ZKEY_PATH" ]]; then
  echo "Missing zkey: $ZKEY_PATH" >&2
  exit 1
fi

snarkjs zkey export solidityverifier "$ZKEY_PATH" "$OUT_PATH"
