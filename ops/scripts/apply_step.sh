#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STEP=""
SCRIPT=""
CMD=""
DRY_RUN="false"

usage() {
  cat <<'USAGE'
Usage: apply_step.sh --step <id> [--script <path>] [--cmd <command>] [--dry-run]
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --step) STEP="$2"; shift 2;;
    --script) SCRIPT="$2"; shift 2;;
    --cmd) CMD="$2"; shift 2;;
    --dry-run) DRY_RUN="true"; shift;;
    -h|--help) usage; exit 0;;
    *) echo "Unknown argument: $1" >&2; exit 1;;
  esac
done

if [[ -z "$STEP" ]]; then
  echo "Missing --step" >&2
  exit 1
fi

if [[ -z "$SCRIPT" && -z "$CMD" ]]; then
  SCRIPT="$ROOT_DIR/ops/steps/step-${STEP}.sh"
fi

if [[ "$DRY_RUN" == "true" ]]; then
  echo "[dry-run] step=$STEP script=${SCRIPT:-none} cmd=${CMD:-none}"
  exit 0
fi

if [[ -n "$CMD" ]]; then
  echo "[apply] step=$STEP cmd=$CMD"
  bash -lc "$CMD"
  exit $?
fi

if [[ -z "$SCRIPT" || ! -f "$SCRIPT" ]]; then
  echo "Step script not found: $SCRIPT" >&2
  exit 1
fi

chmod +x "$SCRIPT" || true

echo "[apply] step=$STEP script=$SCRIPT"
"$SCRIPT"
