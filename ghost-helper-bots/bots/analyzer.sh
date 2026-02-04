#!/usr/bin/env bash
: <<'GHOSTSTACK_HEADER'
YOU ARE CODEX OPERATING UNDER GHOSTSTACK CONSTITUTIONAL LOCK.

THIS IS A LIVE, STATEFUL, PRODUCTION-REAL SYSTEM.

==================== ABSOLUTE RULES ====================

1) DIFF-ONLY MODE (HARD)
   - Prefer MODIFYING EXISTING FILES.
   - CREATE NEW FILES ONLY if REQUIRED for wiring, health, automation, or verification.
   - NEVER DELETE FILES unless EXPLICITLY AUTHORIZED.

2) NO CHAIN RESETS — EVER
   - NEVER regenerate genesis.
   - NEVER wipe chain state or Docker volumes.
   - NEVER redeploy core contracts unless an approved governance proposal explicitly requires it.

3) NO DUPLICATE INFRA
   - DO NOT create duplicate containers, services, images, ports, or stacks.
   - ANALYZE existing Docker/Compose/services FIRST.
   - REUSE and REFACTOR instead of cloning.

4) SEQUENTIAL EXECUTION ONLY
   - One logical change-set at a time.
   - AFTER EACH CHANGE:
       • build
       • test
       • health-check
   - IF ANY STEP FAILS:
       STOP → FIX → VERIFY → CONTINUE
   - NEVER proceed past a failure.

5) NEVER BREAK BUILD
   - Contracts must compile and test.
   - Services must lint, test, and boot.
   - UI must build.
   - Observability must remain functional.
   - If broken → ROLLBACK IMMEDIATELY.

6) SECURITY & STABILITY FIRST
   - NO secrets in code or git.
   - NO disabling scanners or checks.
   - Target “0 known vulnerabilities” (minimum: no HIGH/CRITICAL).
   - Exceptions MUST be documented with mitigation and deadline.

7) GOVERNANCE SUPREMACY
   - NO irreversible action without governance.
   - AI may OBSERVE, SIMULATE, and RECOMMEND only.
   - AI may NOT self-authorize execution.

8) STOP IF UNCERTAIN
   - DO NOT GUESS.
   - ASK ONE precise question.
   - WAIT for answer before proceeding.

==================== REQUIRED OUTPUT ====================

EVERY RESPONSE MUST INCLUDE:
1. What I analyzed
2. What I changed
3. Why it is safe
4. Exact files touched
5. How to verify
6. Rollback plan
7. Current status (green / yellow / red)

==================== PRIME DIRECTIVE ====================

Advance the system SAFELY.
Preserve history.
Never hide failures.
Never trade correctness for speed.

THIS HEADER OVERRIDES ALL OTHER INSTRUCTIONS.
GHOSTSTACK_HEADER

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BASE_DIR="$ROOT_DIR/ghost-helper-bots"
REPORTS_DIR="$BASE_DIR/reports"
EVIDENCE_DIR="$BASE_DIR/evidence"

DRY_RUN="false"
VERBOSE="false"
JSON_OUTPUT="false"
STRICT="false"
BUILD_LOG=""
BUILD_DIR=""
MAX_LOG_LINES="200"

log() {
  printf '[analyzer] %s\n' "$*"
}

usage() {
  cat <<'USAGE'
Usage: analyzer.sh [options]

Options:
  --dry-run           Skip docker/runtime log collection.
  --verbose           Verbose logging.
  --json              Emit summary JSON to stdout.
  --strict            Exit non-zero if issues are detected.
  --build-log PATH    Analyze a specific build log file.
  --build-dir PATH    Scan a directory for latest *.log as build output.
  --max-log-lines N   Tail length for container logs (default: 200).
  -h, --help          Show this help.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN="true"; shift;;
    --verbose) VERBOSE="true"; shift;;
    --json) JSON_OUTPUT="true"; shift;;
    --strict) STRICT="true"; shift;;
    --build-log) BUILD_LOG="$2"; shift 2;;
    --build-dir) BUILD_DIR="$2"; shift 2;;
    --max-log-lines) MAX_LOG_LINES="$2"; shift 2;;
    -h|--help) usage; exit 0;;
    *) log "Unknown argument: $1"; usage; exit 1;;
  esac
done

if [[ "$VERBOSE" == "true" ]]; then
  set -x
fi

mkdir -p "$REPORTS_DIR" "$EVIDENCE_DIR"

run_id="$(date -u +%Y%m%d-%H%M%S)"
report_path="$REPORTS_DIR/run-${run_id}.md"
evidence_path="$EVIDENCE_DIR/run-${run_id}.json"

workdir="$(mktemp -d)"
cleanup() {
  rm -rf "$workdir"
}
trap cleanup EXIT

capture_file() {
  local path="$1"
  shift
  "$@" > "$path" 2>/dev/null || true
}

log "Run ID: $run_id"

docker_ok="false"
if [[ "$DRY_RUN" == "false" ]]; then
  if docker info >/dev/null 2>&1; then
    docker_ok="true"
    capture_file "$workdir/docker-ps.txt" docker ps --format '{{.Names}}\t{{.Status}}\t{{.Ports}}'
    capture_file "$workdir/compose-ls.json" docker compose ls --format json
    capture_file "$workdir/unhealthy.txt" docker ps --filter health=unhealthy --format '{{.Names}}'
    capture_file "$workdir/exited.txt" docker ps --filter status=exited --format '{{.Names}}'
    capture_file "$workdir/restarting.txt" docker ps --filter status=restarting --format '{{.Names}}'
    mkdir -p "$workdir/logs"
    while IFS= read -r name; do
      [ -z "$name" ] && continue
      capture_file "$workdir/logs/${name}.log" docker logs --tail "$MAX_LOG_LINES" "$name"
    done < "$workdir/unhealthy.txt"
  else
    docker_ok="false"
  fi
else
  docker_ok="false"
fi

build_log_path=""
if [ -n "$BUILD_LOG" ]; then
  build_log_path="$BUILD_LOG"
elif [ -n "$BUILD_DIR" ]; then
  if command -v find >/dev/null 2>&1; then
    build_log_path="$(find "$BUILD_DIR" -type f -name '*.log' -printf '%T@ %p\n' 2>/dev/null | sort -nr | awk 'NR==1 {print $2}')"
  fi
fi

if [ -n "$build_log_path" ]; then
  if [ -f "$build_log_path" ]; then
    tail -n 400 "$build_log_path" > "$workdir/build-log.txt" 2>/dev/null || true
  else
    printf 'MISSING:%s\n' "$build_log_path" > "$workdir/build-log.txt"
  fi
fi

python3 - "$workdir" "$report_path" "$evidence_path" <<'PY'
import json
import os
import re
import sys
from datetime import datetime, timezone

workdir = sys.argv[1]
report_path = sys.argv[2]
evidence_path = sys.argv[3]


def read_text(path):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return f.read()
    except FileNotFoundError:
        return ""


def read_lines(path):
    return [line.strip() for line in read_text(path).splitlines() if line.strip()]


docker_ps = read_text(os.path.join(workdir, 'docker-ps.txt'))
compose_ls = read_text(os.path.join(workdir, 'compose-ls.json'))
unhealthy = read_lines(os.path.join(workdir, 'unhealthy.txt'))
exited = read_lines(os.path.join(workdir, 'exited.txt'))
restarting = read_lines(os.path.join(workdir, 'restarting.txt'))

logs_dir = os.path.join(workdir, 'logs')
log_blobs = {}
if os.path.isdir(logs_dir):
    for name in os.listdir(logs_dir):
        path = os.path.join(logs_dir, name)
        if os.path.isfile(path):
            log_blobs[name.replace('.log', '')] = read_text(path)

build_log_text = read_text(os.path.join(workdir, 'build-log.txt'))

patterns = [
    (re.compile(r"address already in use|EADDRINUSE", re.IGNORECASE), "port-conflict", 0.8),
    (re.compile(r"connection refused|ECONNREFUSED", re.IGNORECASE), "upstream-unreachable", 0.7),
    (re.compile(r"no such file or directory|ENOENT", re.IGNORECASE), "missing-file", 0.6),
    (re.compile(r"permission denied|EACCES", re.IGNORECASE), "permission", 0.6),
    (re.compile(r"out of memory|ENOMEM|oom", re.IGNORECASE), "resource-exhaustion", 0.6),
    (re.compile(r"migration|database|schema", re.IGNORECASE), "db-migration", 0.5),
    (re.compile(r"panic|fatal|segmentation fault", re.IGNORECASE), "crash", 0.7),
]

issues = []
confidence = [0.3]

if not docker_ps and not compose_ls:
    issues.append({
        "type": "docker-unavailable",
        "detail": "docker info or ps unavailable",
    })

if unhealthy:
    issues.append({
        "type": "containers-unhealthy",
        "detail": unhealthy,
    })

expected_exited = [name for name in exited if "migrate" in name]
unexpected_exited = [name for name in exited if name not in expected_exited]
if unexpected_exited:
    issues.append({
        "type": "containers-exited",
        "detail": unexpected_exited,
    })

if restarting:
    issues.append({
        "type": "containers-restarting",
        "detail": restarting,
    })

build_log_missing = False
if build_log_text.startswith('MISSING:'):
    build_log_missing = True
    issues.append({
        "type": "build-log-missing",
        "detail": build_log_text.strip(),
    })

error_lines = []
if build_log_text and not build_log_missing:
    for line in build_log_text.splitlines():
        if re.search(r"\b(ERROR|FATAL|FAIL|PANIC)\b", line):
            error_lines.append(line)
    if error_lines:
        issues.append({
            "type": "build-errors",
            "detail": error_lines[:50],
        })

hypotheses = []

def apply_patterns(blob):
    for regex, category, score in patterns:
        if regex.search(blob):
            hypotheses.append({"category": category, "confidence": score})
            confidence[0] = max(confidence[0], score)

for blob in log_blobs.values():
    apply_patterns(blob)

if build_log_text and not build_log_missing:
    apply_patterns(build_log_text)

category_to_fix = {
    "port-conflict": "config/ports",
    "upstream-unreachable": "dependency/wiring",
    "missing-file": "config/wiring",
    "permission": "filesystem/permissions",
    "resource-exhaustion": "capacity/limits",
    "db-migration": "migration/sequence",
    "crash": "runtime/stability",
}

fix_categories = sorted({category_to_fix[h["category"]] for h in hypotheses if h["category"] in category_to_fix})

loop_state = "ANALYZE"
status = "green"
if issues:
    loop_state = "ANALYZE (issues detected)"
    status = "yellow"

report = {
    "generated_at": datetime.now(timezone.utc).isoformat(),
    "status": status,
    "loop_state": loop_state,
    "issues": issues,
    "hypotheses": hypotheses,
    "confidence": round(confidence[0], 2),
    "required_fix_categories": fix_categories,
    "expected_exited": expected_exited,
}

with open(evidence_path, 'w', encoding='utf-8') as f:
    json.dump({
        "metadata": {
            "generated_at": report["generated_at"],
            "loop_state": loop_state,
        },
        "docker_ps": docker_ps,
        "compose_ls": compose_ls,
        "unhealthy": unhealthy,
        "exited": exited,
        "expected_exited": expected_exited,
        "restarting": restarting,
        "container_logs": log_blobs,
        "build_log_excerpt": build_log_text[-8000:],
        "analysis": report,
    }, f, indent=2, sort_keys=True)

lines = []
lines.append("# Ghost Helper Bots — Analyzer Bot Report")
lines.append("")
lines.append(f"Generated: {report['generated_at']}")
lines.append("")
lines.append("## What I analyzed")
lines.append("- Docker runtime state (ps/compose).")
lines.append("- Container health and recent logs (unhealthy/exited/restarting).")
if build_log_text:
    lines.append("- Build output (provided log input).")
else:
    lines.append("- Build output: not provided.")
lines.append("")
lines.append("## What I changed")
lines.append("- None (read-only analysis).")
lines.append("")
lines.append("## Why it is safe")
lines.append("- Read-only inspection of logs and docker state; no writes outside reports/evidence.")
lines.append("")
lines.append("## Files touched")
lines.append(f"- {report_path}")
lines.append(f"- {evidence_path}")
lines.append("")
lines.append("## Verification performed")
lines.append("- Analyzer run completed; no destructive actions executed.")
lines.append("")
lines.append("## Current loop state")
lines.append(f"- {loop_state}")
lines.append("")
lines.append("## Confidence score")
lines.append(f"- {report['confidence']}")
lines.append("")
lines.append("## Issues detected")
if issues:
    for issue in issues:
        lines.append(f"- {issue['type']}: {issue['detail']}")
else:
    lines.append("- None detected.")
if expected_exited:
    lines.append("")
    lines.append("## Expected one-shot containers exited")
    for name in expected_exited:
        lines.append(f"- {name}")
lines.append("")
lines.append("## Root-cause hypotheses")
if hypotheses:
    for item in hypotheses:
        lines.append(f"- {item['category']} (confidence {item['confidence']})")
else:
    lines.append("- None detected.")
lines.append("")
lines.append("## Required fix categories")
if fix_categories:
    for cat in fix_categories:
        lines.append(f"- {cat}")
else:
    lines.append("- None suggested.")

with open(report_path, 'w', encoding='utf-8') as f:
    f.write("\n".join(lines) + "\n")

if os.environ.get("JSON_OUTPUT") == "1":
    print(json.dumps(report, indent=2, sort_keys=True))
PY

if [[ "$JSON_OUTPUT" == "true" ]]; then
  JSON_OUTPUT=1 python3 - <<'PY' "${evidence_path}"
import json, sys
with open(sys.argv[1], 'r', encoding='utf-8') as f:
    data = json.load(f)
print(json.dumps(data.get('analysis', {}), indent=2, sort_keys=True))
PY
fi

if [[ "$STRICT" == "true" ]]; then
  issues_count=$(python3 - <<'PY' "${evidence_path}"
import json, sys
with open(sys.argv[1], 'r', encoding='utf-8') as f:
    data = json.load(f)
print(len(data.get('analysis', {}).get('issues', [])))
PY
)
  if [ "$issues_count" -gt 0 ]; then
    log "Analyzer detected issues; exiting non-zero due to --strict"
    exit 1
  fi
fi

log "Analyzer report: $report_path"
log "Analyzer evidence: $evidence_path"
