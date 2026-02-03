#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODE="staging"
TAG=""

usage() {
  cat <<'USAGE'
Usage: infra/scripts/release-l3.sh --tag=<tag> [--mode=local|staging|production]

Performs: git tag, evidence pack, SBOM (if syft exists), deploy, and smoke tests.
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
  echo "release-l3: --tag is required" >&2
  exit 1
fi

cd "$ROOT_DIR"

echo "[release-l3] tagging $TAG"
if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "release-l3: tag already exists: $TAG" >&2
  exit 1
fi
git tag -a "$TAG" -m "L3 release $TAG"

echo "[release-l3] generating evidence pack"
"$ROOT_DIR/infra/scripts/evidence-pack-l3.sh"

if command -v syft >/dev/null 2>&1; then
  SBOM_OUT="$ROOT_DIR/infra/evidence/out/sbom-l3-${TAG}.spdx.json"
  mkdir -p "$(dirname "$SBOM_OUT")"
  echo "[release-l3] generating SBOM: $SBOM_OUT"
  syft "dir:$ROOT_DIR" -o spdx-json > "$SBOM_OUT"
else
  echo "[release-l3] syft not found; skipping SBOM generation"
fi

echo "[release-l3] deploy mode=$MODE"
case "$MODE" in
  local|staging|production) ;;
  *) echo "release-l3: invalid mode $MODE" >&2; exit 1 ;;
esac

export L3_ENV="$MODE"
echo "[release-l3] syncing env"
"$ROOT_DIR/infra/scripts/env-sync-l3.sh"

echo "[release-l3] starting L3"
"$ROOT_DIR/infra/scripts/opstack/up-l3.sh"

echo "[release-l3] smoke tests"
"$ROOT_DIR/infra/scripts/doctor-l3.sh"

echo "[release-l3] done"
