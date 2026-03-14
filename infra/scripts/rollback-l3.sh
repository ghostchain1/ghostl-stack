#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODE="staging"
TAG=""

usage() {
  cat <<'USAGE'
Usage: infra/scripts/rollback-l3.sh --tag=<tag> [--mode=local|staging|production]

Rolls back to the specified git tag, deploys, and runs smoke tests.
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

if [ -z "$TAG" ]; then
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

export L3_ENV="$MODE"
echo "[rollback-l3] syncing env"
"$ROOT_DIR/infra/scripts/env-sync-l3.sh"

echo "[rollback-l3] starting L3"
"$ROOT_DIR/infra/scripts/opstack/up-l3.sh"

"$ROOT_DIR/infra/scripts/doctor-l3.sh"

echo "[rollback-l3] done"
