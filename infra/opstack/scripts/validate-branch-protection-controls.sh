#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
EVIDENCE_DIR="${PHASE12_EVIDENCE_DIR:-$ROOT_DIR/evidence/phase12}"
mkdir -p "$EVIDENCE_DIR"

failures=0

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
    echo "[phase12] FAIL: $key"
  else
    echo "[phase12] PASS: $key"
  fi
}

json_escape() {
  printf '%s' "$1" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'
}

declare -a CHECK_KEYS=()
declare -A CHECK_CODES
declare -A CHECK_LOGS

run_check "script-syntax-apply-branch-protection" "cd '$ROOT_DIR' && bash -n scripts/github/apply-branch-protection.sh"
run_check "script-syntax-phase12-validator" "cd '$ROOT_DIR' && bash -n infra/opstack/scripts/validate-branch-protection-controls.sh"

run_check "required-contexts-in-script" "cd '$ROOT_DIR' && python3 - <<'PY'
from pathlib import Path
text = Path('scripts/github/apply-branch-protection.sh').read_text()
required = [
  'rpc-namespace',
  'shellcheck',
  'node-lint-build',
  'contracts-hardhat-compile',
  'contracts-gst-invariant',
  'contracts-lge-tests',
  'contracts-cascading-finality',
  'secure-preflight',
]
missing = [x for x in required if x not in text]
if missing:
  raise SystemExit('missing required contexts in apply script: ' + ', '.join(missing))
print('ok')
PY"

run_check "required-workflow-jobs" "cd '$ROOT_DIR' && python3 - <<'PY'
from pathlib import Path
ci = Path('.github/workflows/ci.yml').read_text()
sec = Path('.github/workflows/security-production-preflight.yml').read_text()
checks = {
  'rpc-namespace': 'rpc-namespace',
  'shellcheck': 'shellcheck',
  'node-lint-build': 'node-lint-build',
  'contracts-hardhat-compile': 'contracts-hardhat-compile',
  'contracts-gst-invariant': 'contracts-gst-invariant',
  'contracts-lge-tests': 'contracts-lge-tests',
  'contracts-cascading-finality': 'contracts-cascading-finality',
}
missing = [name for name in checks if f'\n  {name}:' not in ci]
if missing:
  raise SystemExit('missing required CI jobs: ' + ', '.join(missing))
if '\n  secure-preflight:' not in sec:
  raise SystemExit('missing secure-preflight job in security-production-preflight workflow')
print('ok')
PY"

run_check "checklist-contains-required-checks" "cd '$ROOT_DIR' && python3 - <<'PY'
from pathlib import Path
text = Path('docs/checklists/BRANCH_PROTECTION_SECURITY.md').read_text()
required = [
  'rpc-namespace',
  'shellcheck',
  'node-lint-build',
  'contracts-hardhat-compile',
  'contracts-gst-invariant',
  'contracts-lge-tests',
  'contracts-cascading-finality',
  'secure-preflight',
]
missing = [x for x in required if x not in text]
if missing:
  raise SystemExit('checklist missing required checks: ' + ', '.join(missing))
print('ok')
PY"

# Safe dry-run: does not write because apply script now short-circuits label creation in dry-run mode.
run_check "apply-branch-protection-dry-run" "cd '$ROOT_DIR' && scripts/github/apply-branch-protection.sh ghostchain1/ghostl-stack main --dry-run"

{
  echo "{"
  echo "  \"ok\": $([[ "$failures" -eq 0 ]] && echo true || echo false),"
  echo "  \"checks\": {"
  for i in "${!CHECK_KEYS[@]}"; do
    key="${CHECK_KEYS[$i]}"
    code="${CHECK_CODES[$key]}"
    log="${CHECK_LOGS[$key]}"
    comma=","
    if [[ "$i" -eq $((${#CHECK_KEYS[@]} - 1)) ]]; then
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
} | tee "$EVIDENCE_DIR/branch-protection-gate.txt"

if [[ "$failures" -ne 0 ]]; then
  exit 1
fi

echo "[phase12] PASS: branch protection controls validated"
