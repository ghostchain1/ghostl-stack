#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
EVIDENCE_DIR="${PHASE13_EVIDENCE_DIR:-$ROOT_DIR/evidence/phase13}"
mkdir -p "$EVIDENCE_DIR"

failures=0

declare -a CHECK_KEYS=()
declare -A CHECK_CODES
declare -A CHECK_LOGS

json_escape() {
  printf '%s' "$1" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'
}

run_check() {
  local key="$1"
  local cmd="$2"
  local logfile="$EVIDENCE_DIR/${key}.txt"

  set +e
  bash -lc "$cmd" >"$logfile" 2>&1
  local code=$?
  set -e

  CHECK_KEYS+=("$key")
  CHECK_CODES[$key]="$code"
  CHECK_LOGS[$key]="$logfile"

  if [[ "$code" -ne 0 ]]; then
    failures=$((failures + 1))
    echo "[phase13] FAIL: $key"
  else
    echo "[phase13] PASS: $key"
  fi
}

run_check "script-syntax-phase13-validator" "cd '$ROOT_DIR' && bash -n infra/opstack/scripts/validate-release-workflow-governance.sh"

run_check "docker-publish-main-only" "cd '$ROOT_DIR' && python3 - <<'PY'
from pathlib import Path
text = Path('.github/workflows/docker-publish.yml').read_text()
if 'master' in text:
    raise SystemExit('docker-publish workflow still references master')
if 'branches:' not in text or '- main' not in text:
    raise SystemExit('docker-publish workflow_run must include main branch')
print('ok')
PY"

run_check "security-preflight-main-only" "cd '$ROOT_DIR' && python3 - <<'PY'
from pathlib import Path
text = Path('.github/workflows/security-production-preflight.yml').read_text()
if '\n  push:' not in text:
    raise SystemExit('security preflight must be push-triggered')
if '- main' not in text:
    raise SystemExit('security preflight must include main branch')
if 'master' in text:
    raise SystemExit('security preflight should not reference master')
print('ok')
PY"

run_check "ai-governance-tag-scoped" "cd '$ROOT_DIR' && python3 - <<'PY'
from pathlib import Path
text = Path('.github/workflows/ai-governance-gate.yml').read_text()
if 'tags:' not in text or 'v*' not in text:
    raise SystemExit('AI governance gate must be tag-scoped for releases')
if '\n    branches:' in text:
    raise SystemExit('AI governance gate should not use push branches')
print('ok')
PY"

run_check "contracts-cascading-main-and-paths" "cd '$ROOT_DIR' && python3 - <<'PY'
from pathlib import Path
text = Path('.github/workflows/contracts-cascading-fast.yml').read_text()
if 'contracts/src/governance/bridge/**' not in text:
    raise SystemExit('contracts cascading workflow missing governance bridge path filter')
if '\n  push:' not in text or '- main' not in text:
    raise SystemExit('contracts cascading workflow push must include main')
if 'master' in text:
    raise SystemExit('contracts cascading workflow should not reference master')
print('ok')
PY"

run_check "checklist-main-tags-governance" "cd '$ROOT_DIR' && python3 - <<'PY'
from pathlib import Path
text = Path('docs/checklists/BRANCH_PROTECTION_SECURITY.md').read_text()
needle = 'main + tags only'
text = text.replace(chr(96), '')
if needle not in text:
    raise SystemExit('checklist missing release scope governance statement: ' + needle)
print('ok')
PY"

{
  echo "{"
  echo "  \"ok\": $([[ "$failures" -eq 0 ]] && echo true || echo false),"
  echo "  \"checks\": {"
  for i in "${!CHECK_KEYS[@]}"; do
    key="${CHECK_KEYS[$i]}"
    code="${CHECK_CODES[$key]}"
    log="${CHECK_LOGS[$key]}"
    comma=","
    if [[ "$i" -eq $(( ${#CHECK_KEYS[@]} - 1 )) ]]; then
      comma=""
    fi
    echo "    \"$key\": {"
    echo "      \"exitCode\": $code,"
    echo "      \"ok\": $([[ "$code" -eq 0 ]] && echo true || echo false),"
    echo "      \"log\": $(json_escape "${log#$ROOT_DIR/}")"
    echo "    }$comma"
  done
  echo "  },"
  echo "  \"failures\": $failures"
  echo "}"
} | tee "$EVIDENCE_DIR/release-workflow-governance-gate.txt"

if [[ "$failures" -ne 0 ]]; then
  exit 1
fi

echo "[phase13] PASS: release workflow governance validated"
