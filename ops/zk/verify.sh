#!/usr/bin/env bash
set -Eeuo pipefail

PROOF_PATH=""
VKEY_PATH=""
TMP_DIR="$(mktemp -d)"

usage() {
  cat <<'USAGE'
Usage: verify.sh --proof <path> --vkey <path>
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --proof) PROOF_PATH="$2"; shift 2;;
    --vkey) VKEY_PATH="$2"; shift 2;;
    -h|--help) usage; exit 0;;
    *) echo "Unknown argument: $1" >&2; exit 1;;
  esac
done

if [[ -z "$PROOF_PATH" || -z "$VKEY_PATH" ]]; then
  echo "Missing required arguments." >&2
  exit 1
fi

if ! command -v snarkjs >/dev/null 2>&1; then
  echo "snarkjs is required for verification." >&2
  exit 1
fi

python3 - "$PROOF_PATH" "$TMP_DIR/proof.json" "$TMP_DIR/public.json" <<'PY'
import json,sys
payload=json.load(open(sys.argv[1]))
json.dump(payload.get("proof",{}),open(sys.argv[2],"w"),indent=2)
json.dump(payload.get("publicSignals",[]),open(sys.argv[3],"w"),indent=2)
PY

snarkjs groth16 verify "$VKEY_PATH" "$TMP_DIR/public.json" "$TMP_DIR/proof.json"

rm -rf "$TMP_DIR"
