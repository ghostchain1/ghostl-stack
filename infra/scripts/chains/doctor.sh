#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="${ROOT_DIR:-$(cd "$SCRIPT_DIR/../../.." && pwd)}"

check_dir() {
  local dir="$1"
  if [ ! -d "$dir" ]; then
    echo "Missing: $dir"
    return 1
  fi
  return 0
}

check_file_readable() {
  local p="$1"
  if [ ! -f "$p" ]; then
    echo "Missing: $p"
    return 1
  fi
  if [ ! -r "$p" ]; then
    echo "Not readable (permissions): $p"
    ls -la "$p" || true
    return 1
  fi
  return 0
}

echo "Chains doctor"
echo "User: $(id)"

for chain in l2 l3; do
  cfg="$ROOT_DIR/chains/$chain/chain.json"
  data="$ROOT_DIR/chains/$chain/data"
  genesis="$data/genesis.json"

  echo
  echo "[$chain]"
  check_file_readable "$cfg" || exit 1
  check_dir "$data" || echo "  data dir missing (run: bash infra/scripts/chains/init.sh)"
  if [ -d "$data" ]; then
    if [ -f "$genesis" ]; then
      check_file_readable "$genesis" || echo "  tip: run: bash infra/scripts/chains/init.sh (it will try to fix perms)"
    else
      echo "  genesis missing (run: bash infra/scripts/chains/init.sh)"
    fi
  fi
done

echo
echo "OK"
