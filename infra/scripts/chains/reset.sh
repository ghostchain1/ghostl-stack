#!/usr/bin/env bash
set -Eeuo pipefail

# Reset Ghost-native devnet data.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="${ROOT_DIR:-$(cd "$SCRIPT_DIR/../../.." && pwd)}"

# shellcheck source=scripts/lib/docker.sh
. "$ROOT_DIR/scripts/lib/docker.sh"
hg_require_docker_compose

usage() {
  cat <<EOF >&2
Usage: bash infra/scripts/chains/reset.sh [--l3 <name>] [--keep-l2]
  --l3 <name>   accepted for compatibility; resets the canonical GhostL3 state
  --keep-l2     skip resetting GhostL2 and reset GhostL3 only
EOF
}

keep_l2=0
reset_l3_only=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --l3)
      reset_l3_only=1
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

remove_matching_volumes() {
  local suffixes=("$@")
  local existing
  existing="$(hg_docker volume ls --format '{{.Name}}' 2>/dev/null || true)"
  local suffix volume

  for suffix in "${suffixes[@]}"; do
    while IFS= read -r volume; do
      [[ -n "$volume" ]] || continue
      echo "Removing volume: $volume"
      hg_docker volume rm -f "$volume" >/dev/null 2>&1 || true
    done < <(printf '%s\n' "$existing" | rg "${suffix}$" || true)
  done
}

if [[ "$keep_l2" == "0" && "$reset_l3_only" == "0" ]]; then
  echo "Resetting GhostChain / GhostL2 / GhostL3 core state..."
  bash "$ROOT_DIR/infra/scripts/reset.sh"
  exit 0
fi

echo "Resetting GhostL3-only state while keeping GhostL2 intact..."
hg_docker compose -f "$ROOT_DIR/docker-compose.custom-rollup.yml" stop \
  ghost-exec-l3 ghost-sequencer-l3 ghost-deriver-l3 ghost-settlement-l3 ghost-bridge-l3 ghost-proof-l3 >/dev/null 2>&1 || true

remove_matching_volumes \
  "ghost-exec-l3-state" \
  "ghost-deriver-l3-state" \
  "ghost-settlement-l3-state" \
  "ghost-bridge-l3-state" \
  "ghost-proof-l3-state"

echo "Reset complete."
