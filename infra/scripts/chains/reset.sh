#!/usr/bin/env bash
set -euo pipefail

# Reset OP Stack devnet data (L2 base and optional L3 overlays).

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="${ROOT_DIR:-$(cd "$SCRIPT_DIR/../../.." && pwd)}"
OP_DIR="$ROOT_DIR/infra/opstack"

usage() {
  cat <<EOF >&2
Usage: bash infra/scripts/chains/reset.sh [--l3 <name>] [--keep-l2]
  --l3 <name>   wipe data for the specified L3 overlay under infra/opstack/l3/<name>/data (can be repeated)
  --keep-l2     skip resetting the base OP Stack L2 (opstack/reset.sh)
EOF
}

keep_l2=0
l3_names=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --l3)
      l3_names+=("$2")
      shift 2
      ;;
    --keep-l2)
      keep_l2=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [ $keep_l2 -eq 0 ]; then
  echo "Resetting OP Stack L2 (op-geth/op-node)..."
  bash "$ROOT_DIR/infra/scripts/opstack/reset.sh"
else
  echo "Skipping L2 reset (per --keep-l2)"
fi

for name in "${l3_names[@]}"; do
  l3_dir="$OP_DIR/l3/$name"
  data_dir="$l3_dir/data"
  if [ ! -d "$l3_dir" ]; then
    echo "L3 not found: $l3_dir (skipping)" >&2
    continue
  fi
  echo "Wiping L3 data for '$name' ($data_dir)..."
  rm -rf "$data_dir"
  mkdir -p "$data_dir" "$data_dir/op-node" "$data_dir/l3-geth"
done

echo "Reset complete."
