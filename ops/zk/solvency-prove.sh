#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CIRCUIT_PATH="$ROOT_DIR/ops/zk/circuit/solvency.circom"
BUILD_DIR="$ROOT_DIR/ops/zk/build-solvency"
KEYS_DIR="$ROOT_DIR/ops/zk/keys"
SNAPSHOT_PATH=""
OUT_PROOF=""
OUT_VKEY=""
PTAU_PATH="${ZK_PTAU_PATH:-}"
ENTROPY="${ZK_ENTROPY:-}"

usage() {
  cat <<'USAGE'
Usage: solvency-prove.sh --snapshot <snapshot.json> --out-proof <proof.json> --out-vkey <vkey.json>
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --snapshot) SNAPSHOT_PATH="$2"; shift 2;;
    --out-proof) OUT_PROOF="$2"; shift 2;;
    --out-vkey) OUT_VKEY="$2"; shift 2;;
    -h|--help) usage; exit 0;;
    *) echo "Unknown argument: $1" >&2; exit 1;;
  esac
done

if [[ -z "$SNAPSHOT_PATH" || -z "$OUT_PROOF" || -z "$OUT_VKEY" ]]; then
  echo "Missing required arguments." >&2
  exit 1
fi

if ! command -v circom >/dev/null 2>&1; then
  echo "circom is required." >&2
  exit 1
fi
if ! command -v snarkjs >/dev/null 2>&1; then
  echo "snarkjs is required." >&2
  exit 1
fi

mkdir -p "$BUILD_DIR" "$KEYS_DIR"

INPUT_JSON="$BUILD_DIR/input.json"
node "$ROOT_DIR/ops/zk/solvency-witness.mjs" --snapshot "$SNAPSHOT_PATH" --out "$INPUT_JSON"

circom "$CIRCUIT_PATH" --r1cs --wasm --sym -o "$BUILD_DIR"

ZKEY_PATH="$KEYS_DIR/solvency_final.zkey"
if [[ ! -f "$ZKEY_PATH" ]]; then
  if [[ -z "$PTAU_PATH" || -z "$ENTROPY" ]]; then
    echo "ZK_PTAU_PATH and ZK_ENTROPY are required to create proving keys." >&2
    exit 1
  fi
  snarkjs groth16 setup "$BUILD_DIR/solvency.r1cs" "$PTAU_PATH" "$BUILD_DIR/solvency_0000.zkey"
  snarkjs zkey contribute "$BUILD_DIR/solvency_0000.zkey" "$ZKEY_PATH" --name "ghost-solvency" --entropy "$ENTROPY"
fi

snarkjs zkey export verificationkey "$ZKEY_PATH" "$OUT_VKEY"
snarkjs zkey export solidityverifier "$ZKEY_PATH" "$ROOT_DIR/ops/zk/SolvencyVerifier.sol" >/dev/null 2>&1 || true

node "$BUILD_DIR/solvency_js/generate_witness.js" "$INPUT_JSON" "$BUILD_DIR/witness.wtns"
snarkjs groth16 prove "$ZKEY_PATH" "$BUILD_DIR/witness.wtns" "$BUILD_DIR/proof.json" "$BUILD_DIR/public.json"

python3 - "$BUILD_DIR/proof.json" "$BUILD_DIR/public.json" "$OUT_PROOF" <<'PY'
import json,sys
proof=json.load(open(sys.argv[1]))
public=json.load(open(sys.argv[2]))
json.dump({"proof": proof, "publicSignals": public},open(sys.argv[3],"w"),indent=2)
PY

echo "solvency_proof_generated:$OUT_PROOF"
