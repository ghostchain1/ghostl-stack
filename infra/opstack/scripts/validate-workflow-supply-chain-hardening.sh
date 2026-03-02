#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
EVIDENCE_DIR="${PHASE14_EVIDENCE_DIR:-$ROOT_DIR/evidence/phase14}"
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
    echo "[phase14] FAIL: $key"
  else
    echo "[phase14] PASS: $key"
  fi
}

run_check "script-syntax-phase14-validator" "cd '$ROOT_DIR' && bash -n infra/opstack/scripts/validate-workflow-supply-chain-hardening.sh"

run_check "critical-workflow-action-pinning" "cd '$ROOT_DIR' && python3 - <<'PY'
from pathlib import Path
import re

workflow_paths = [
  '.github/workflows/ci.yml',
  '.github/workflows/docker-publish.yml',
  '.github/workflows/security-production-preflight.yml',
  '.github/workflows/contracts-cascading-fast.yml',
  '.github/workflows/ai-governance-gate.yml',
]

sha_ref = re.compile(r'^[^@\s]+@[0-9a-f]{40}$')
unsafe_tag_ref = re.compile(r'^[^@\s]+@v\d+(?:\.\d+)*$')

errors = []
for rel in workflow_paths:
    text = Path(rel).read_text()
    for i, raw in enumerate(text.splitlines(), start=1):
        line = raw.strip()
        if not line.startswith('uses: '):
            continue
        ref = line[len('uses: '):].split('#', 1)[0].strip()
        if unsafe_tag_ref.match(ref):
            errors.append(f'{rel}:{i} uses mutable tag ref: {ref}')
        elif not sha_ref.match(ref):
            errors.append(f'{rel}:{i} uses non-SHA ref: {ref}')

if errors:
    raise SystemExit('\n'.join(errors))
print('ok')
PY"

run_check "critical-workflow-permissions-baseline" "cd '$ROOT_DIR' && python3 - <<'PY'
from pathlib import Path

workflow_paths = [
  '.github/workflows/ci.yml',
  '.github/workflows/docker-publish.yml',
  '.github/workflows/security-production-preflight.yml',
  '.github/workflows/contracts-cascading-fast.yml',
  '.github/workflows/ai-governance-gate.yml',
]

missing = []
for rel in workflow_paths:
    text = Path(rel).read_text()
    if '\npermissions: {}' not in text:
        missing.append(rel)

if missing:
    raise SystemExit('missing top-level permissions baseline: ' + ', '.join(missing))
print('ok')
PY"

run_check "docker-publish-main-only-scope" "cd '$ROOT_DIR' && python3 - <<'PY'
from pathlib import Path
text = Path('.github/workflows/docker-publish.yml').read_text()
if 'master' in text:
    raise SystemExit('docker-publish must not reference master')
if '\n    branches:\n      - main\n' not in text:
    raise SystemExit('docker-publish workflow_run branches must be main-only')
if 'github.event.workflow_run.head_branch == \'main\'' not in text:
    raise SystemExit('docker-publish build guard must enforce workflow_run head_branch main')
print('ok')
PY"

run_check "security-and-governance-release-scope" "cd '$ROOT_DIR' && python3 - <<'PY'
from pathlib import Path
sec = Path('.github/workflows/security-production-preflight.yml').read_text()
ai = Path('.github/workflows/ai-governance-gate.yml').read_text()
if 'master' in sec:
    raise SystemExit('security preflight must not reference master')
if '\n  push:\n    branches:\n      - main\n' not in sec:
    raise SystemExit('security preflight push scope must be main-only')
if 'tags:' not in ai or 'v*' not in ai:
    raise SystemExit('ai governance gate must include release tag scope v*')
if '\n    branches:' in ai:
    raise SystemExit('ai governance gate should not define push branches')
print('ok')
PY"

run_check "contracts-cascading-governance-scope" "cd '$ROOT_DIR' && python3 - <<'PY'
from pathlib import Path
text = Path('.github/workflows/contracts-cascading-fast.yml').read_text()
if 'master' in text:
    raise SystemExit('contracts cascading workflow must not reference master')
if '\n  push:\n    branches:\n      - main\n' not in text:
    raise SystemExit('contracts cascading push scope must be main-only')
if 'contracts/src/governance/bridge/**' not in text:
    raise SystemExit('contracts cascading workflow missing governance bridge path filter')
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
} | tee "$EVIDENCE_DIR/workflow-supply-chain-gate.txt"

if [[ "$failures" -ne 0 ]]; then
  exit 1
fi

echo "[phase14] PASS: workflow supply-chain hardening validated"
