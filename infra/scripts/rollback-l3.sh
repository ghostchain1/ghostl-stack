#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODE="staging"
TAG=""

usage() {
  cat <<'USAGE'
Usage: infra/scripts/rollback-l3.sh --tag=<tag> [--mode=local|staging|production]

Rolls back to the specified git tag, syncs GhostL3 env, starts the canonical path, and runs smoke tests.
USAGE
}

for arg in "$@"; do
  case "$arg" in
    --mode=*) MODE="${arg#*=}" ;;
    --tag=*) TAG="${arg#*=}" ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $arg" >&2; usage; exit 1 ;;
  esac
done

if [[ -z "$TAG" ]]; then
  echo "rollback-l3: --tag is required" >&2
  exit 1
fi

cd "$ROOT_DIR"

if ! git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "rollback-l3: tag not found: $TAG" >&2
  exit 1
fi

echo "[rollback-l3] checking out $TAG"
git checkout "$TAG"

echo "[rollback-l3] syncing GhostL3 env"
L3_ENV="$MODE" "$ROOT_DIR/infra/scripts/env-sync-l3.sh"

echo "[rollback-l3] starting Ghost-native chain path"
STRICT_SECRETS="${STRICT_SECRETS:-0}" \
START_PHASE3_SERVICES=0 \
START_OBSERVABILITY_STACK=0 \
RUN_DOCTOR=0 \
  "$ROOT_DIR/infra/scripts/up.sh"

echo "[rollback-l3] smoke tests"
"$ROOT_DIR/infra/scripts/doctor-l3.sh"

echo "[rollback-l3] done"
