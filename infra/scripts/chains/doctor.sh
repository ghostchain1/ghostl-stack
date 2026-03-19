#!/usr/bin/env bash
set -Eeuo pipefail

# Ghost-native chain doctor for GhostL2 and GhostL3.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="${ROOT_DIR:-$(cd "$SCRIPT_DIR/../../.." && pwd)}"

usage() {
  cat <<EOF >&2
Usage: bash infra/scripts/chains/doctor.sh [all|l2|l3] [--dry-run]
  all (default): run the full Ghost-native doctor
  l2:            run only the GhostL2 doctor
  l3:            run only the GhostL3 doctor
EOF
}

target="all"
args=()

for arg in "$@"; do
  case "$arg" in
    all|l2|l3)
      target="$arg"
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      args+=("$arg")
      ;;
  esac
done

case "$target" in
  all)
    bash "$ROOT_DIR/infra/scripts/doctor.sh" "${args[@]}"
    ;;
  l2)
    bash "$ROOT_DIR/infra/scripts/doctor-l2.sh" "${args[@]}"
    ;;
  l3)
    bash "$ROOT_DIR/infra/scripts/doctor-l3.sh" "${args[@]}"
    ;;
  *)
    usage
    exit 1
    ;;
esac
