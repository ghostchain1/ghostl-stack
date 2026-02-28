#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="/tmp/ghostvm-ai-bundles"
DEPTH="${DEPTH:-20}"
PR_NUMBER=""
DRY_RUN=false
RUN_TESTS=true
BUILD_BUNDLE=true
BUNDLE_DIR_OVERRIDE=""
JSON_OUT=false

usage() {
  cat <<'EOF'
Usage:
  ./scripts/release_checklist.sh [output_dir] [--pr-comment <number>] [--dry-run] [--no-tests] [--no-bundle --bundle-dir <path>] [--json]

Examples:
  ./scripts/release_checklist.sh
  ./scripts/release_checklist.sh /tmp/ghostvm-ai-bundles
  ./scripts/release_checklist.sh /tmp/ghostvm-ai-bundles --pr-comment 61
  ./scripts/release_checklist.sh /tmp/ghostvm-ai-bundles --pr-comment 61 --dry-run
  ./scripts/release_checklist.sh /tmp/ghostvm-ai-bundles --no-tests
  ./scripts/release_checklist.sh --no-bundle --bundle-dir /tmp/ghostvm-ai-bundles/<timestamp>
  ./scripts/release_checklist.sh /tmp/ghostvm-ai-bundles --no-tests --json

Notes:
  - PR comment requires `gh` CLI and `GITHUB_TOKEN`.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    --pr-comment)
      if [[ $# -lt 2 ]]; then
        echo "missing value for --pr-comment"
        exit 64
      fi
      PR_NUMBER="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --no-tests)
      RUN_TESTS=false
      shift
      ;;
    --no-bundle)
      BUILD_BUNDLE=false
      shift
      ;;
    --bundle-dir)
      if [[ $# -lt 2 ]]; then
        echo "missing value for --bundle-dir"
        exit 64
      fi
      BUNDLE_DIR_OVERRIDE="$2"
      shift 2
      ;;
    --json)
      JSON_OUT=true
      shift
      ;;
    *)
      if [[ "$OUT_DIR" != "/tmp/ghostvm-ai-bundles" ]]; then
        echo "unexpected argument: $1"
        usage
        exit 64
      fi
      OUT_DIR="$1"
      shift
      ;;
  esac
done

if [[ "$BUILD_BUNDLE" == "false" && -z "$BUNDLE_DIR_OVERRIDE" ]]; then
  echo "--no-bundle requires --bundle-dir <path>"
  exit 64
fi

if [[ "$RUN_TESTS" == "true" ]]; then
  echo "[1/3] Running test gate"
  (
    cd "$ROOT_DIR"
    PYTHONPATH=. pytest -q -ra
  )
else
  echo "[1/3] Skipping test gate (--no-tests)"
fi

if [[ "$BUILD_BUNDLE" == "true" ]]; then
  echo "[2/3] Building signed evidence bundle"
  BUNDLE_JSON="$(
    cd "$ROOT_DIR"
    PYTHONPATH=. python3 ghostnetsync.py bundle-evidence --include-all --depth "$DEPTH" --output "$OUT_DIR" --sign
  )"

BUNDLE_DIR="$(python3 - <<'PY' "$BUNDLE_JSON"
import json
import sys
payload = json.loads(sys.argv[1])
print(payload["bundle_dir"])
PY
)"

ARCHIVE_PATH="$(python3 - <<'PY' "$BUNDLE_JSON"
import json
import sys
payload = json.loads(sys.argv[1])
print(payload.get("archive", ""))
PY
)"
else
  echo "[2/3] Skipping bundle build (--no-bundle)"
  BUNDLE_DIR="$BUNDLE_DIR_OVERRIDE"
  ARCHIVE_PATH=""
fi

echo "[3/3] Running strict verification gate"
(
  cd "$ROOT_DIR"
  PYTHONPATH=. python3 ghostnetsync.py verify-bundle --bundle-dir "$BUNDLE_DIR" --jsonl --strict >/tmp/ghostvm-ai-release-verify.jsonl
)

if [[ -n "$PR_NUMBER" ]]; then
  echo "[4/4] Posting PR verification summary"
  if [[ "$DRY_RUN" != "true" ]]; then
    if ! command -v gh >/dev/null 2>&1; then
      echo "gh CLI is required for --pr-comment"
      exit 69
    fi
    if [[ -z "${GITHUB_TOKEN:-}" ]]; then
      echo "GITHUB_TOKEN is required for --pr-comment"
      exit 69
    fi
  fi

  SUMMARY_PATH="/tmp/ghostvm-ai-release-summary.md"
  python3 - <<'PY' "$BUNDLE_DIR" "$ARCHIVE_PATH" "$SUMMARY_PATH"
import json
import sys
from pathlib import Path

bundle_dir, archive, out = sys.argv[1], sys.argv[2], sys.argv[3]
lines = Path('/tmp/ghostvm-ai-release-verify.jsonl').read_text(encoding='utf-8').splitlines()
checks = []
for line in lines:
    if not line.strip():
        continue
    obj = json.loads(line)
    if obj.get('type') == 'check':
        checks.append(obj)

md = [
    "### GhostVM AI Release Checklist PASS",
    "",
    f"- Bundle Dir: `{bundle_dir}`",
    f"- Archive: `{archive if archive else 'n/a (prebuilt bundle path)'}`",
    "",
    "| Check | OK | Details |",
    "|---|---:|---|",
]
for c in checks:
    md.append(f"| {c.get('name','')} | {'✅' if c.get('ok') else '❌'} | {c.get('details','')} |")

Path(out).write_text('\n'.join(md) + '\n', encoding='utf-8')
PY

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "[dry-run] PR comment preview for #$PR_NUMBER"
    cat "$SUMMARY_PATH"
  else
    gh pr comment "$PR_NUMBER" --body-file "$SUMMARY_PATH"
  fi
fi

echo "RELEASE_CHECKLIST PASS bundle_dir=$BUNDLE_DIR archive=$ARCHIVE_PATH"

if [[ "$JSON_OUT" == "true" ]]; then
  python3 - <<'PY' \
  "$BUNDLE_DIR" \
  "$ARCHIVE_PATH" \
  "$OUT_DIR" \
  "$RUN_TESTS" \
  "$BUILD_BUNDLE" \
  "$PR_NUMBER" \
  "$DRY_RUN" \
  "$DEPTH"
import json
import sys

bundle_dir, archive, out_dir, run_tests, build_bundle, pr_number, dry_run, depth = sys.argv[1:9]
payload = {
  "ok": True,
  "status": "pass",
  "bundle_dir": bundle_dir,
  "archive": archive or None,
  "output_dir": out_dir,
  "options": {
    "run_tests": run_tests == "true",
    "build_bundle": build_bundle == "true",
    "pr_comment": int(pr_number) if pr_number else None,
    "dry_run": dry_run == "true",
    "depth": int(depth),
  },
  "artifacts": {
    "verify_jsonl": "/tmp/ghostvm-ai-release-verify.jsonl",
  },
}
print(json.dumps(payload, indent=2))
PY
fi
