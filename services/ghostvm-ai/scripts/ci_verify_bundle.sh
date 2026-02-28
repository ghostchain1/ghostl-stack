#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <bundle_dir>"
  exit 64
fi

BUNDLE_DIR="$1"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TMP_OUT="$(mktemp)"

set +e
PYTHONPATH="$ROOT_DIR" python3 "$ROOT_DIR/ghostnetsync.py" verify-bundle --bundle-dir "$BUNDLE_DIR" --jsonl --strict >"$TMP_OUT"
STATUS=$?
set -e

python3 - <<'PY' "$TMP_OUT" "$STATUS" "$BUNDLE_DIR"
import json
import sys
from pathlib import Path

jsonl_path = Path(sys.argv[1])
status = int(sys.argv[2])
bundle_dir = sys.argv[3]

summary = None
failed = []
for line in jsonl_path.read_text(encoding="utf-8").splitlines():
    if not line.strip():
        continue
    obj = json.loads(line)
    if obj.get("type") == "bundle_summary":
        summary = obj
    elif obj.get("type") == "check" and not obj.get("ok", False):
        failed.append(f"{obj.get('name')}: {obj.get('details', '')}")

if status == 0:
    print(f"BUNDLE_VERIFY PASS bundle={bundle_dir}")
else:
    reason = failed[0] if failed else "unknown_failure"
    print(f"BUNDLE_VERIFY FAIL bundle={bundle_dir} exit={status} reason={reason}")
PY

cat "$TMP_OUT"
rm -f "$TMP_OUT"
exit "$STATUS"
