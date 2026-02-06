#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

log() { printf '[full-host-go-no-go] %s\n' "$*"; }
die() { log "ERROR: $*"; exit 1; }

require_cmd() {
  local c="$1"
  command -v "$c" >/dev/null 2>&1 || die "missing required command: $c"
}

ensure_clean_tree() {
  if [ -n "$(git -C "$ROOT_DIR" status --porcelain=v1)" ]; then
    die "git working tree is dirty; run from a clean checkout"
  fi
}

ensure_no_skip_flags() {
  local offenders
  offenders="$(env | rg -n '^(SKIP_|L1_DOCTOR_SKIP_|L2_DOCTOR_SKIP_|L3_DOCTOR_SKIP_|L2_GO_NO_GO_SKIP_|L3_GO_NO_GO_SKIP_|AI_GO_NO_GO_ALLOW_DIRTY|ALLOW_DEV_SECRETS)=' || true)"
  if [ -n "$offenders" ]; then
    die "skip/dev flags present in environment; unset them before running:\n$offenders"
  fi
}

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
out_dir="${ROOT_DIR}/ops/runbooks/out"
mkdir -p "$out_dir"

require_cmd bash
require_cmd git
require_cmd docker
require_cmd trivy
require_cmd node
require_cmd npm

# gates expect Foundry
if ! command -v forge >/dev/null 2>&1; then
  if [ -n "${FORGE_BIN:-}" ] && [ -x "${FORGE_BIN:-}" ]; then
    export PATH="$(dirname "$FORGE_BIN"):$PATH"
  fi
fi
require_cmd forge

if ! docker compose version >/dev/null 2>&1; then
  die "docker compose v2 is required (docker compose version)"
fi

ensure_clean_tree
ensure_no_skip_flags

log "HEAD: $(git -C "$ROOT_DIR" rev-parse HEAD)"

run_gate() {
  local name="$1"
  shift
  local log_file="${out_dir}/${name}-${timestamp}.log"
  log "Running ${name} (log: ${log_file})"
  (cd "$ROOT_DIR" && "$@") >"$log_file" 2>&1
  log "${name}: OK"
}

run_gate "l1-go-no-go" bash infra/scripts/gates/l1-go-no-go.sh
run_gate "l2-go-no-go" bash infra/scripts/gates/l2-go-no-go.sh
run_gate "l3-go-no-go" bash infra/scripts/gates/l3-go-no-go.sh

run_gate "slither" npm --prefix contracts run formal:slither
python3 - <<'PY'
import json
path="contracts/reports/formal/summary.json"
with open(path) as f:
    summary=json.load(f)
issues=summary.get("issues")
err=summary.get("error")
if err:
    raise SystemExit(f"slither summary reports error: {err}")
if issues is None:
    raise SystemExit("slither summary has issues=null")
if int(issues) != 0:
    raise SystemExit(f"slither blocking issues != 0: {issues}")
print("slither summary OK")
PY

run_gate "trivy-scan" bash ops/scripts/scan.sh

run_gate "ai-go-no-go" bash infra/scripts/gates/ai-go-no-go.sh

log "All full-host gates passed."
log "Evidence packs: ${ROOT_DIR}/infra/evidence/out"
log "Run logs: ${out_dir}/*-${timestamp}.log"

