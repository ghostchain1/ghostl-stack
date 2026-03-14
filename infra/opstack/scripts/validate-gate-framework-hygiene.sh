#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
EVIDENCE_DIR="${PHASE16_EVIDENCE_DIR:-$ROOT_DIR/evidence/phase16}"
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
    echo "[phase16] FAIL: $key"
  else
    echo "[phase16] PASS: $key"
  fi
}

run_check "script-syntax-phase16-validator" "cd '$ROOT_DIR' && bash -n infra/opstack/scripts/validate-gate-framework-hygiene.sh"

run_check "phase10-15-validator-presence" "cd '$ROOT_DIR' && python3 - <<'PY'
from pathlib import Path

validators = {
    10: Path('infra/opstack/scripts/validate-fault-safety-controls.sh'),
    11: Path('infra/opstack/scripts/validate-operational-readiness.sh'),
    12: Path('infra/opstack/scripts/validate-branch-protection-controls.sh'),
    13: Path('infra/opstack/scripts/validate-release-workflow-governance.sh'),
    14: Path('infra/opstack/scripts/validate-workflow-supply-chain-hardening.sh'),
    15: Path('infra/opstack/scripts/validate-phase-continuity-integrity.sh'),
}

for phase, path in validators.items():
    if not path.exists():
        raise SystemExit(f'missing validator for phase {phase}: {path}')
print('ok')
PY"

run_check "phase10-15-validator-hygiene" "cd '$ROOT_DIR' && python3 - <<'PY'
from pathlib import Path

validators = [
    Path('infra/opstack/scripts/validate-fault-safety-controls.sh'),
    Path('infra/opstack/scripts/validate-operational-readiness.sh'),
    Path('infra/opstack/scripts/validate-branch-protection-controls.sh'),
    Path('infra/opstack/scripts/validate-release-workflow-governance.sh'),
    Path('infra/opstack/scripts/validate-workflow-supply-chain-hardening.sh'),
    Path('infra/opstack/scripts/validate-phase-continuity-integrity.sh'),
]

for path in validators:
    text = path.read_text()
    if '#!/usr/bin/env bash' not in text:
        raise SystemExit(f'missing bash shebang: {path}')
    if 'set -euo pipefail' not in text:
        raise SystemExit(f'missing strict shell mode: {path}')
    if 'ROOT_DIR=' not in text:
        raise SystemExit(f'missing ROOT_DIR declaration: {path}')
    if 'json_escape()' not in text:
        raise SystemExit(f'missing json_escape helper: {path}')
print('ok')
PY"

run_check "phase10-15-validator-syntax" "cd '$ROOT_DIR' && for f in \
  infra/opstack/scripts/validate-fault-safety-controls.sh \
  infra/opstack/scripts/validate-operational-readiness.sh \
  infra/opstack/scripts/validate-branch-protection-controls.sh \
  infra/opstack/scripts/validate-release-workflow-governance.sh \
  infra/opstack/scripts/validate-workflow-supply-chain-hardening.sh \
  infra/opstack/scripts/validate-phase-continuity-integrity.sh; do
  bash -n \"\$f\";
done"

run_check "phase10-15-evidence-contract" "cd '$ROOT_DIR' && python3 - <<'PY'
from pathlib import Path

for phase in range(10, 16):
    base = Path(f'evidence/phase{phase}')
    if not base.exists():
        raise SystemExit(f'missing evidence dir: {base}')
    required = ['README.md', 'gate-exit.txt', 'gate-status.txt', 'script-syntax.txt']
    for name in required:
        p = base / name
        if not p.exists():
            raise SystemExit(f'missing evidence artifact for phase {phase}: {p}')

    gate_files = list(base.glob('*gate*.txt'))
    if not gate_files:
        raise SystemExit(f'missing gate summary txt for phase {phase}: {base}')

print('ok')
PY"

run_check "phase10-15-report-and-index-links" "cd '$ROOT_DIR' && python3 - <<'PY'
from pathlib import Path

index = Path('docs/checklists/README.md').read_text()
for phase in range(10, 16):
    report_path = Path(f'docs/phase{phase}-report.md')
    if not report_path.exists():
        raise SystemExit(f'missing report: {report_path}')

    report_text = report_path.read_text()
    if 'Status: **PASS**' not in report_text:
        raise SystemExit(f'report missing PASS marker: {report_path}')
    if '## Re-run command' not in report_text:
        raise SystemExit(f'report missing rerun section: {report_path}')

    needle = f'../phase{phase}-report.md'
    if needle not in index:
        raise SystemExit(f'checklist index missing link: {needle}')

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
} | tee "$EVIDENCE_DIR/gate-framework-hygiene-gate.txt"

if [[ "$failures" -ne 0 ]]; then
  exit 1
fi

echo "[phase16] PASS: gate framework hygiene validated"
