#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODE="staging"
TAG=""

usage() {
  cat <<'USAGE'
Usage: infra/scripts/rollback-l2.sh --tag=<tag> [--mode=local|staging|production]

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
  echo "rollback-l2: --tag is required" >&2
  exit 1
fi

cd "$ROOT_DIR"

if ! git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "rollback-l2: tag not found: $TAG" >&2
  exit 1
fi

echo "[rollback-l2] checking out $TAG"
git checkout "$TAG"

export L2_ENV="$MODE"
echo "[rollback-l2] syncing env"
"$ROOT_DIR/infra/scripts/env-sync-l2.sh"

echo "[rollback-l2] starting L2"
"$ROOT_DIR/infra/scripts/opstack/up-l2.sh"

"$ROOT_DIR/infra/scripts/doctor-l2.sh"

echo "[rollback-l2] done"
