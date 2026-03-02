#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
EVIDENCE_DIR="${PHASE15_EVIDENCE_DIR:-$ROOT_DIR/evidence/phase15}"
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
    echo "[phase15] FAIL: $key"
  else
    echo "[phase15] PASS: $key"
  fi
}

run_check "script-syntax-phase15-validator" "cd '$ROOT_DIR' && bash -n infra/opstack/scripts/validate-phase-continuity-integrity.sh"

run_check "phase10-14-report-and-evidence-presence" "cd '$ROOT_DIR' && python3 - <<'PY'
from pathlib import Path

for phase in range(10, 15):
    report = Path(f'docs/phase{phase}-report.md')
    readme = Path(f'evidence/phase{phase}/README.md')
    if not report.exists():
        raise SystemExit(f'missing report: {report}')
    if not readme.exists():
        raise SystemExit(f'missing evidence index: {readme}')
print('ok')
PY"

run_check "phase10-14-gate-markers-pass" "cd '$ROOT_DIR' && python3 - <<'PY'
from pathlib import Path

for phase in range(10, 15):
    gate_status = Path(f'evidence/phase{phase}/gate-status.txt')
    gate_exit = Path(f'evidence/phase{phase}/gate-exit.txt')
    if not gate_status.exists():
        raise SystemExit(f'missing gate status marker: {gate_status}')
    if not gate_exit.exists():
        raise SystemExit(f'missing gate exit marker: {gate_exit}')

    status_text = gate_status.read_text().strip()
    exit_text = gate_exit.read_text().strip()

    expected_status = f'Gate{phase}=PASS'
    if expected_status not in status_text:
        raise SystemExit(f'gate status mismatch in {gate_status}: expected {expected_status}, got {status_text}')
    if 'exit_code=0' not in exit_text:
        raise SystemExit(f'gate exit mismatch in {gate_exit}: expected exit_code=0, got {exit_text}')
print('ok')
PY"

run_check "phase10-14-gate-json-ok" "cd '$ROOT_DIR' && python3 - <<'PY'
from pathlib import Path
import re

gate_files = {
    10: Path('evidence/phase10/fault-safety-gate.txt'),
    11: Path('evidence/phase11/operational-readiness-gate.txt'),
    12: Path('evidence/phase12/branch-protection-gate.txt'),
    13: Path('evidence/phase13/release-workflow-governance-gate.txt'),
    14: Path('evidence/phase14/workflow-supply-chain-gate.txt'),
}

for phase, gate_file in gate_files.items():
    if not gate_file.exists():
        raise SystemExit(f'missing gate summary file for phase {phase}: {gate_file}')
    text = gate_file.read_text()
    pattern = rf'{chr(34)}ok{chr(34)}\s*:\s*true'
    if not re.search(pattern, text):
        raise SystemExit(f'gate summary not ok for phase {phase}: {gate_file}')
print('ok')
PY"

run_check "phase10-14-reports-pass-state" "cd '$ROOT_DIR' && python3 - <<'PY'
from pathlib import Path

for phase in range(10, 15):
    report = Path(f'docs/phase{phase}-report.md')
    text = report.read_text()
    if 'Status: **PASS**' not in text:
        raise SystemExit(f'report missing PASS status marker: {report}')
print('ok')
PY"

run_check "checklist-index-phase10-14-links" "cd '$ROOT_DIR' && python3 - <<'PY'
from pathlib import Path

text = Path('docs/checklists/README.md').read_text()
for phase in range(10, 15):
    needle = f'../phase{phase}-report.md'
    if needle not in text:
        raise SystemExit(f'checklist missing phase report link: {needle}')
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
} | tee "$EVIDENCE_DIR/phase-continuity-integrity-gate.txt"

if [[ "$failures" -ne 0 ]]; then
  exit 1
fi

echo "[phase15] PASS: phase continuity and integrity validated"
