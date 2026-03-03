#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

log() { printf '[gst-symbol-gate] %s\n' "$*"; }
fail() { printf '[gst-symbol-gate][FAIL] %s\n' "$*" >&2; exit 1; }

if ! command -v git >/dev/null 2>&1; then
  fail "missing required binary: git"
fi

# Enforce that the legacy gas token symbol "GHOST" does not appear in first-party, user-facing
# code/config/docs. Generated artifacts and migration inventories are excluded.
EXCLUDES=(
  ':!contracts/reports/formal/**'
  ':!docs/gst-migration/**'
  ':!docs/rollback/**'
  ':!docs/GHOSTSTACK_PITCH_DECK_COPY.md'
  ':!docs/GHOSTSTACK_UI_DESIGN_SYSTEM.md'
  ':!docs/GHOSTSTACK_INVESTOR_DECK.md'
  ':!docs/BRAND_IDENTITY.md'
  ':!scripts/gst-symbol-gate.sh'
  ':!backups/**'
  ':!infra/docker/_backup/**'
  ':!infra/docker/runtime/**'
  ':!infra/docker/audit/**'
  ':!infra/opstack/broadcast/**'
  ':!evidence/**'
)

matches="$(
  {
    git grep -n -I -w 'GHOST' -- . "${EXCLUDES[@]}" || true
    git grep -n -I 'gGHOST' -- . "${EXCLUDES[@]}" || true
  } | sed '/^$/d' | sort -u
)"

if [ -z "$matches" ]; then
  log "OK: no forbidden legacy GHOST symbol tokens found."
  exit 0
fi

{
  echo "Forbidden legacy GHOST symbol detected (GST-native policy violation):"
  echo
  echo "$matches" | head -n 200
  if [ "$(echo "$matches" | wc -l | tr -d ' ')" -gt 200 ]; then
    echo "... (truncated)"
  fi
  echo
  echo "If this is an intentional historical reference, move it under docs/gst-migration/ or docs/rollback/."
} >&2

exit 1
