#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

OUT_DIR="${1:?usage: create-pr-snapshot.sh <output-dir>}"
BASE_REF="${BASE_REF:-origin/main}"

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

BASE="$(git merge-base HEAD "$BASE_REF")"
mapfile -t changed_files < <(git diff --name-only --diff-filter=ACMR "$BASE" HEAD)

for rel in "${changed_files[@]}"; do
  [[ -f "$rel" ]] || continue
  mkdir -p "$OUT_DIR/$(dirname "$rel")"
  cp "$rel" "$OUT_DIR/$rel"
done

for rel in docs/brand/spec.json; do
  if [[ -f "$rel" && ! -f "$OUT_DIR/$rel" ]]; then
    mkdir -p "$OUT_DIR/$(dirname "$rel")"
    cp "$rel" "$OUT_DIR/$rel"
  fi
done

printf '%s\n' "${changed_files[@]}" > "$OUT_DIR/.changed-files"
printf '%s\n' "$OUT_DIR"
