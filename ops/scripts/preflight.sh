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
OUT_DIR="$ROOT_DIR/ops/preflight/$(date -u +%Y%m%d-%H%M%S)"
RUN_L1_DOCTOR="false"
EMIT_L1_EVIDENCE="false"
DRY_RUN="false"
VERBOSE="false"
JSON_OUTPUT="false"

PREFLIGHT_MIN_DISK_GB="${PREFLIGHT_MIN_DISK_GB:-0}"
PREFLIGHT_MIN_RAM_GB="${PREFLIGHT_MIN_RAM_GB:-0}"

CHECKS_FILE="$OUT_DIR/checks.tsv"
PORTS_JSON="$OUT_DIR/port-conflicts.json"
ENVS_JSON="$OUT_DIR/missing-env-files.json"
RPC_JSON="$OUT_DIR/rpc-checks.json"
SUMMARY_JSON="$OUT_DIR/summary.json"

mkdir -p "$OUT_DIR/compose"

log() {
  printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

usage() {
  cat <<'USAGE'
Usage: preflight.sh [options]

Options:
  --l1-doctor           Run L1 doctor (read-only).
  --emit-l1-evidence    Emit L1 evidence pack (read-only).
  --dry-run             Skip runtime and RPC checks.
  --verbose             Verbose logging.
  --json                Emit summary JSON to stdout.
  -h, --help            Show this help.

Environment:
  PREFLIGHT_MIN_DISK_GB   Minimum disk (GB) required to pass (default: 0).
  PREFLIGHT_MIN_RAM_GB    Minimum RAM (GB) required to pass (default: 0).
USAGE
}

record_check() {
  local name="$1"
  local status="$2"
  local detail="$3"
  printf '%s\t%s\t%s\n' "$name" "$status" "$detail" >> "$CHECKS_FILE"
}

HAS_FAILURE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --l1-doctor) RUN_L1_DOCTOR="true"; shift;;
    --emit-l1-evidence) EMIT_L1_EVIDENCE="true"; shift;;
    --dry-run) DRY_RUN="true"; shift;;
    --verbose) VERBOSE="true"; shift;;
    --json) JSON_OUTPUT="true"; shift;;
    -h|--help) usage; exit 0;;
    *) echo "Unknown argument: $1" >&2; usage; exit 1;;
  esac
done

if [[ "$VERBOSE" == "true" ]]; then
  set -x
fi

log "Preflight output: $OUT_DIR"

: > "$CHECKS_FILE"

required_bins=(docker rg python3 curl node npm)
for bin in "${required_bins[@]}"; do
  if command -v "$bin" >/dev/null 2>&1; then
    record_check "binary:$bin" "ok" "$(command -v "$bin")"
  else
    record_check "binary:$bin" "fail" "missing"
    HAS_FAILURE=1
  fi
done

if command -v docker >/dev/null 2>&1; then
  if docker compose version >/dev/null 2>&1; then
    record_check "binary:docker-compose" "ok" "docker compose"
  else
    record_check "binary:docker-compose" "fail" "docker compose unavailable"
    HAS_FAILURE=1
  fi
fi

if command -v rg >/dev/null 2>&1; then
  rg --files -g 'docker-compose*.yml' \
    -g '!**/backups/**' \
    -g '!**/ops/snapshots/**' \
    -g '!**/infra/docker/_backup/**' \
    -g '!**/infra/docker/compose/**' \
    -g '!**/services/**/rollback/**' \
    -g '!**/interop-devnet/**' \
    "$ROOT_DIR" | sort > "$OUT_DIR/compose-files.txt"
else
  find "$ROOT_DIR" -name 'docker-compose*.yml' \
    -not -path '*/backups/*' \
    -not -path '*/ops/snapshots/*' \
    -not -path '*/infra/docker/_backup/*' \
    -not -path '*/infra/docker/compose/*' \
    -not -path '*/services/*/rollback/*' \
    -not -path '*/interop-devnet/*' | sort > "$OUT_DIR/compose-files.txt"
fi

# Disk and RAM checks (thresholds are configurable)
if command -v df >/dev/null 2>&1; then
  disk_kb=$(df -Pk "$ROOT_DIR" | awk 'NR==2 {print $4}')
  disk_gb=$(awk -v kb="$disk_kb" 'BEGIN {printf "%.1f", kb/1024/1024}')
  record_check "disk:available_gb" "ok" "$disk_gb"
  if awk -v have="$disk_gb" -v min="$PREFLIGHT_MIN_DISK_GB" 'BEGIN {exit (have < min)}'; then
    record_check "disk:threshold" "ok" "min=${PREFLIGHT_MIN_DISK_GB}"
  else
    record_check "disk:threshold" "fail" "min=${PREFLIGHT_MIN_DISK_GB}"
    HAS_FAILURE=1
  fi
fi

if [ -f /proc/meminfo ]; then
  mem_kb=$(awk '/MemTotal/ {print $2}' /proc/meminfo)
  mem_gb=$(awk -v kb="$mem_kb" 'BEGIN {printf "%.1f", kb/1024/1024}')
  record_check "ram:available_gb" "ok" "$mem_gb"
  if awk -v have="$mem_gb" -v min="$PREFLIGHT_MIN_RAM_GB" 'BEGIN {exit (have < min)}'; then
    record_check "ram:threshold" "ok" "min=${PREFLIGHT_MIN_RAM_GB}"
  else
    record_check "ram:threshold" "fail" "min=${PREFLIGHT_MIN_RAM_GB}"
    HAS_FAILURE=1
  fi
fi

# Required env files
required_envs=(
  "$ROOT_DIR/services/stack.env"
  "$ROOT_DIR/infra/opstack/.env.l3"
)
for envf in "${required_envs[@]}"; do
  if [ -f "$envf" ]; then
    record_check "envfile:${envf#$ROOT_DIR/}" "ok" "present"
  else
    record_check "envfile:${envf#$ROOT_DIR/}" "fail" "missing"
    HAS_FAILURE=1
  fi
done

# Port conflicts + env_file existence from compose
if command -v python3 >/dev/null 2>&1; then
  if python3 - "$OUT_DIR/compose-files.txt" "$PORTS_JSON" "$ENVS_JSON" <<'PY'
import json
import os
import sys

try:
    import yaml
except Exception as exc:
    print(f"missing yaml: {exc}")
    sys.exit(2)

compose_list = sys.argv[1]
ports_json = sys.argv[2]
envs_json = sys.argv[3]

with open(compose_list, "r", encoding="utf-8") as f:
    files = [line.strip() for line in f if line.strip()]

intra_conflicts = {}
cross_ports = {}
missing_envs = []


def add_cross(port, file):
    cross_ports.setdefault(port, set()).add(file)


def host_port_from_str(s: str):
    s = s.split("/")[0]
    if ":" not in s:
        return None
    parts = s.split(":")
    if len(parts) >= 2:
        return parts[-2]
    return None

for rel in files:
    if not os.path.exists(rel):
        continue
    try:
        data = yaml.safe_load(open(rel, "r", encoding="utf-8"))
    except Exception:
        continue
    if not isinstance(data, dict):
        continue
    services = data.get("services") or {}
    if not isinstance(services, dict):
        continue
    port_map = {}
    for svc, cfg in services.items():
        if not isinstance(cfg, dict):
            cfg = {}
        ports = cfg.get("ports") or []
        for port in ports:
            host_port = None
            if isinstance(port, str):
                host_port = host_port_from_str(port)
            elif isinstance(port, dict):
                published = port.get("published")
                if published is not None:
                    host_port = str(published)
            if host_port:
                port_map.setdefault(host_port, []).append(svc)
                add_cross(host_port, rel)
        env_files = cfg.get("env_file")
        env_list = []
        if isinstance(env_files, str):
            env_list = [env_files]
        elif isinstance(env_files, list):
            env_list = [e for e in env_files if isinstance(e, str)]
        for envf in env_list:
            env_path = envf
            if not os.path.isabs(envf):
                env_path = os.path.normpath(os.path.join(os.path.dirname(rel), envf))
            if not os.path.exists(env_path):
                missing_envs.append({
                    "compose": rel,
                    "service": svc,
                    "env_file": envf,
                    "resolved_path": env_path,
                })
    for port, svcs in port_map.items():
        if len(svcs) > 1:
            intra_conflicts.setdefault(rel, {})[port] = sorted(set(svcs))

cross_conflicts = {p: sorted(list(files)) for p, files in cross_ports.items() if len(files) > 1}

with open(ports_json, "w", encoding="utf-8") as f:
    json.dump({
        "intra_file_conflicts": intra_conflicts,
        "cross_file_conflicts": cross_conflicts,
    }, f, indent=2, sort_keys=True)

with open(envs_json, "w", encoding="utf-8") as f:
    json.dump({"missing_env_files": missing_envs}, f, indent=2, sort_keys=True)

if intra_conflicts or missing_envs:
    sys.exit(2)
PY
  then
    record_check "compose:ports_env" "ok" "ports/env files clean"
  else
    record_check "compose:ports_env" "fail" "see ${PORTS_JSON##$ROOT_DIR/}, ${ENVS_JSON##$ROOT_DIR/}"
    HAS_FAILURE=1
  fi
else
  record_check "compose:ports_env" "fail" "python3 unavailable"
  HAS_FAILURE=1
fi

if [[ "$DRY_RUN" == "false" ]]; then
  if docker info >/dev/null 2>&1; then
    docker ps --format '{{json .}}' > "$OUT_DIR/docker-ps.json" || true
    docker compose ls --format json > "$OUT_DIR/compose-projects.json" || true
    docker network ls --format '{{json .}}' > "$OUT_DIR/docker-networks.json" || true
    docker volume ls --format '{{json .}}' > "$OUT_DIR/docker-volumes.json" || true
    record_check "docker:runtime" "ok" "runtime captured"
  else
    record_check "docker:runtime" "fail" "docker daemon not reachable"
    HAS_FAILURE=1
  fi
else
  record_check "docker:runtime" "skip" "dry-run"
fi

if docker info >/dev/null 2>&1; then
  if docker compose version >/dev/null 2>&1; then
    while IFS= read -r file; do
      rel="${file#$ROOT_DIR/}"
      slug="${rel//\//__}"
      out="$OUT_DIR/compose/${slug%.yml}.json"
      if [[ "$rel" == "infra/opstack/docker-compose.challengers.yml" ]]; then
        base="$ROOT_DIR/infra/opstack/docker-compose.yml"
        l3="$ROOT_DIR/infra/opstack/docker-compose.l3.yml"
        if ! docker compose -f "$base" -f "$l3" -f "$file" config --format json > "$out" 2>"$out.err"; then
          log "compose config failed for $rel (see $out.err)"
        fi
        continue
      fi
      if [[ "$rel" == "infra/opstack/docker-compose.l3.yml" ]]; then
        base="$ROOT_DIR/infra/opstack/docker-compose.yml"
        if ! docker compose -f "$base" -f "$file" config --format json > "$out" 2>"$out.err"; then
          log "compose config failed for $rel (see $out.err)"
        fi
        continue
      fi
      if ! docker compose -f "$file" config --format json > "$out" 2>"$out.err"; then
        log "compose config failed for $rel (see $out.err)"
      fi
    done < "$OUT_DIR/compose-files.txt"
  fi
fi

# RPC checks
rpc_results=()
if [[ "$DRY_RUN" == "false" && -f "$ROOT_DIR/services/stack.env" ]]; then
  while IFS='=' read -r key value; do
    key="${key%%[[:space:]]*}"
    value="${value%$'\r'}"
    case "$key" in
      RPC_L1|RPC_L2|RPC_L3)
        if [ -n "$value" ]; then
          rpc_results+=("$key=$value")
        fi
        ;;
    esac
  done < <(grep -E '^(RPC_L1|RPC_L2|RPC_L3)=' "$ROOT_DIR/services/stack.env")
fi

if [[ "$DRY_RUN" == "false" && ${#rpc_results[@]} -gt 0 ]]; then
  : > "$RPC_JSON"
  for entry in "${rpc_results[@]}"; do
    name="${entry%%=*}"
    url="${entry#*=}"
    resp="$(curl -sS --max-time 5 -H 'Content-Type: application/json' \
      --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' \
      "$url" 2>/dev/null || true)"
    chain_id="$(printf '%s' "$resp" | python3 - <<'PY'
import json, sys
raw = sys.stdin.read()
try:
    data = json.loads(raw)
    print(data.get('result', ''))
except Exception:
    print('')
PY
)"
    if [ -n "$chain_id" ]; then
      record_check "rpc:$name" "ok" "$chain_id"
      printf '{"name":"%s","url":"%s","status":"ok","chain_id":"%s"}\n' "$name" "$url" "$chain_id" >> "$RPC_JSON"
    else
      record_check "rpc:$name" "fail" "unreachable"
      printf '{"name":"%s","url":"%s","status":"fail"}\n' "$name" "$url" >> "$RPC_JSON"
      HAS_FAILURE=1
    fi
  done
else
  if [[ "$DRY_RUN" == "true" ]]; then
    record_check "rpc:checks" "skip" "dry-run"
  else
    record_check "rpc:checks" "fail" "RPC_L1/2/3 missing"
    HAS_FAILURE=1
  fi
fi

if [[ "$RUN_L1_DOCTOR" == "true" ]]; then
  if [[ "$DRY_RUN" == "true" ]]; then
    record_check "l1:doctor" "skip" "dry-run"
  elif [[ -x "$ROOT_DIR/infra/scripts/doctor-l1.sh" ]]; then
    log "Running L1 doctor"
    if "$ROOT_DIR/infra/scripts/doctor-l1.sh" > "$OUT_DIR/l1-doctor.log" 2>&1; then
      record_check "l1:doctor" "ok" "ok"
    else
      record_check "l1:doctor" "fail" "see $OUT_DIR/l1-doctor.log"
      HAS_FAILURE=1
    fi
  else
    record_check "l1:doctor" "fail" "missing script"
    HAS_FAILURE=1
  fi
fi

if [[ "$EMIT_L1_EVIDENCE" == "true" ]]; then
  if [[ "$DRY_RUN" == "true" ]]; then
    record_check "l1:evidence" "skip" "dry-run"
  elif [[ -x "$ROOT_DIR/infra/scripts/evidence-pack-l1.sh" ]]; then
    log "Generating L1 evidence pack"
    if "$ROOT_DIR/infra/scripts/evidence-pack-l1.sh" > "$OUT_DIR/l1-evidence-pack.log" 2>&1; then
      record_check "l1:evidence" "ok" "ok"
    else
      record_check "l1:evidence" "fail" "see $OUT_DIR/l1-evidence-pack.log"
      HAS_FAILURE=1
    fi
  else
    record_check "l1:evidence" "fail" "missing script"
    HAS_FAILURE=1
  fi
fi

python3 - "$CHECKS_FILE" "$SUMMARY_JSON" <<'PY'
import json
import sys
from datetime import datetime, timezone

checks_file = sys.argv[1]
summary_path = sys.argv[2]

checks = []
failures = []
with open(checks_file, "r", encoding="utf-8") as f:
    for line in f:
        line = line.rstrip("\n")
        if not line:
            continue
        name, status, detail = line.split("\t", 2)
        checks.append({"name": name, "status": status, "detail": detail})
        if status == "fail":
            failures.append(name)

summary = {
    "generated_at": datetime.now(timezone.utc).isoformat(),
    "checks": checks,
    "failures": failures,
}

with open(summary_path, "w", encoding="utf-8") as f:
    json.dump(summary, f, indent=2, sort_keys=True)

print(summary_path)
PY

if [[ "$JSON_OUTPUT" == "true" ]]; then
  cat "$SUMMARY_JSON"
fi

if [ "$HAS_FAILURE" -ne 0 ]; then
  log "Preflight complete: FAIL"
  exit 1
fi

log "Preflight complete: OK"
