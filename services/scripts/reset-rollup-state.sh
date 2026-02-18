#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
reset-rollup-state.sh

Resets the local rollup proposer/challenger cursors so they re-sync from onchain state.

Usage:
  services/scripts/reset-rollup-state.sh [--l2] [--l3] [--proposer-only|--challenger-only] [--no-restart] [--dry-run]

Options:
  --l2               Reset L2->L1 rollup services (containers with *-l2 suffix).
  --l3               Reset L3->L2 rollup services (containers without *-l2 suffix).
  --proposer-only    Only reset proposer cursor.json
  --challenger-only  Only reset challenger state.json
  --no-restart       Do not restart containers after writing state files.
  --dry-run          Print what would be done without changing anything.
USAGE
}

DO_L2=0
DO_L3=0
DO_PROPOSER=1
DO_CHALLENGER=1
RESTART=1
DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --l2) DO_L2=1 ;;
    --l3) DO_L3=1 ;;
    --proposer-only) DO_CHALLENGER=0 ;;
    --challenger-only) DO_PROPOSER=0 ;;
    --no-restart) RESTART=0 ;;
    --dry-run) DRY_RUN=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; usage; exit 2 ;;
  esac
  shift
done

if [[ "$DO_L2" -eq 0 && "$DO_L3" -eq 0 ]]; then
  DO_L2=1
  DO_L3=1
fi

DOCKER="docker"
if ! docker ps >/dev/null 2>&1; then
  DOCKER="sudo docker"
fi

find_container() {
  local include="$1"
  local exclude="${2:-}"
  local name
  if [[ -n "$exclude" ]]; then
    name="$($DOCKER ps --format '{{.Names}}' | grep -E "$include" | grep -Ev "$exclude" | head -n1 || true)"
  else
    name="$($DOCKER ps --format '{{.Names}}' | grep -E "$include" | head -n1 || true)"
  fi
  if [[ -z "$name" ]]; then
    echo "Container not found (include=$include exclude=$exclude)" >&2
    exit 1
  fi
  printf '%s' "$name"
}

write_state() {
  local container="$1"
  local path="$2"
  local json="$3"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[dry-run] write $container:$path <= $json"
    return
  fi
  printf '%s\n' "$json" | $DOCKER exec -i "$container" sh -lc "cat > '$path'"
}

restart_container() {
  local container="$1"
  if [[ "$RESTART" -eq 0 ]]; then
    echo "[info] not restarting $container (--no-restart)"
    return
  fi
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[dry-run] restart $container"
    return
  fi
  $DOCKER restart "$container" >/dev/null
}

reset_l3() {
  local proposer challenger
  proposer="$(find_container 'ghost-rollup-proposer' 'ghost-rollup-proposer-l2')"
  challenger="$(find_container 'ghost-rollup-challenger' 'ghost-rollup-challenger-l2')"

  echo "[info] L3 rollup proposer=$proposer challenger=$challenger"
  if [[ "$DO_PROPOSER" -eq 1 ]]; then
    write_state "$proposer" "/state/cursor.json" '{ "nextChildBlock": null }'
  fi
  if [[ "$DO_CHALLENGER" -eq 1 ]]; then
    write_state "$challenger" "/state/state.json" '{ "nextBatchToCheck": null }'
  fi

  restart_container "$proposer"
  restart_container "$challenger"
}

reset_l2() {
  local proposer challenger
  proposer="$(find_container 'ghost-rollup-proposer-l2')"
  challenger="$(find_container 'ghost-rollup-challenger-l2')"

  echo "[info] L2 rollup proposer=$proposer challenger=$challenger"
  if [[ "$DO_PROPOSER" -eq 1 ]]; then
    write_state "$proposer" "/state/cursor.json" '{ "nextChildBlock": null }'
  fi
  if [[ "$DO_CHALLENGER" -eq 1 ]]; then
    write_state "$challenger" "/state/state.json" '{ "nextBatchToCheck": null }'
  fi

  restart_container "$proposer"
  restart_container "$challenger"
}

if [[ "$DO_L3" -eq 1 ]]; then reset_l3; fi
if [[ "$DO_L2" -eq 1 ]]; then reset_l2; fi

