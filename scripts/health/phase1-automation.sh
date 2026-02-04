#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/services/docker-compose.legacy.yml"

APPLY=0
RESTART=0
DRY_RUN=1
WAIT_TIMEOUT=120
HC_INTERVAL="15s"
HC_TIMEOUT="5s"
HC_RETRIES="5"
HC_TEST_TEMPLATE='curl -sf "{url}"'

MAP_FILE=""
declare -A MAP=()
declare -a SERVICES_ORDER=()

timestamp() {
  date -u +%Y-%m-%dT%H:%M:%SZ
}

log() {
  printf '[%s] %s\n' "$(timestamp)" "$*"
}

die() {
  log "ERROR: $*"
  exit 1
}

trim() {
  local s="$1"
  s="${s#"${s%%[![:space:]]*}"}"
  s="${s%"${s##*[![:space:]]}"}"
  printf '%s' "$s"
}

usage() {
  cat <<'USAGE'
Usage: phase1-automation.sh [options]

Adds missing healthchecks in services/docker-compose.legacy.yml from a
service->health URL mapping, then optionally restarts services sequentially
with health gates.

Options:
  --map service=url         Add a mapping entry (repeatable).
  --map-file path           Read mapping entries from file (service=url per line).
  --compose path            Compose file (default: services/docker-compose.legacy.yml).
  --apply                   Write changes to compose file (default: dry-run).
  --dry-run                 Show planned changes only (default).
  --restart                 Restart mapped services sequentially with health gates.
  --interval 15s            Healthcheck interval for inserted checks.
  --timeout 5s              Healthcheck timeout for inserted checks.
  --retries 5               Healthcheck retries for inserted checks.
  --test-template "cmd"      Template for healthcheck command; must include {url}.
  --wait-timeout 120        Seconds to wait for each service to become healthy.
  -h, --help                Show this help.

Examples:
  scripts/health/phase1-automation.sh \
    --map bridge-service=http://127.0.0.1:7400/health \
    --map contract-registry-service=http://127.0.0.1:7412/health \
    --apply --restart

  scripts/health/phase1-automation.sh \
    --map-file ops/healthchecks.map \
    --apply
USAGE
}

add_mapping() {
  local entry="$1"
  if [[ "$entry" != *"="* ]]; then
    die "Invalid mapping '$entry' (expected service=url)."
  fi
  local svc="${entry%%=*}"
  local url="${entry#*=}"
  svc="$(trim "$svc")"
  url="$(trim "$url")"
  if [ -z "$svc" ] || [ -z "$url" ]; then
    die "Invalid mapping '$entry' (empty service or url)."
  fi
  MAP["$svc"]="$url"
  SERVICES_ORDER+=("$svc")
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --map)
      [ $# -ge 2 ] || die "--map requires a value"
      add_mapping "$2"
      shift 2
      ;;
    --map-file)
      [ $# -ge 2 ] || die "--map-file requires a value"
      MAP_FILE="$2"
      shift 2
      ;;
    --compose)
      [ $# -ge 2 ] || die "--compose requires a value"
      COMPOSE_FILE="$2"
      shift 2
      ;;
    --apply)
      APPLY=1
      DRY_RUN=0
      shift
      ;;
    --dry-run)
      APPLY=0
      DRY_RUN=1
      shift
      ;;
    --restart)
      RESTART=1
      shift
      ;;
    --interval)
      [ $# -ge 2 ] || die "--interval requires a value"
      HC_INTERVAL="$2"
      shift 2
      ;;
    --timeout)
      [ $# -ge 2 ] || die "--timeout requires a value"
      HC_TIMEOUT="$2"
      shift 2
      ;;
    --retries)
      [ $# -ge 2 ] || die "--retries requires a value"
      HC_RETRIES="$2"
      shift 2
      ;;
    --test-template)
      [ $# -ge 2 ] || die "--test-template requires a value"
      HC_TEST_TEMPLATE="$2"
      shift 2
      ;;
    --wait-timeout)
      [ $# -ge 2 ] || die "--wait-timeout requires a value"
      WAIT_TIMEOUT="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "Unknown argument: $1"
      ;;
  esac
done

if [ -n "$MAP_FILE" ]; then
  [ -f "$MAP_FILE" ] || die "Mapping file not found: $MAP_FILE"
  while IFS= read -r line || [ -n "$line" ]; do
    line="$(trim "$line")"
    [ -z "$line" ] && continue
    [[ "$line" == \#* ]] && continue
    add_mapping "$line"
  done < "$MAP_FILE"
fi

if [ ${#MAP[@]} -eq 0 ]; then
  die "No mappings provided. Use --map or --map-file."
fi

if command -v realpath >/dev/null 2>&1; then
  COMPOSE_FILE="$(realpath "$COMPOSE_FILE")"
else
  COMPOSE_FILE="$(python3 - <<'PY' "$COMPOSE_FILE"
import pathlib, sys
print(pathlib.Path(sys.argv[1]).resolve())
PY
)"
fi

[ -f "$COMPOSE_FILE" ] || die "Compose file not found: $COMPOSE_FILE"

# Build ordered, de-duplicated list for restarts and map export.
declare -A SEEN=()
declare -a SERVICES_ORDER_DEDUPED=()
MAP_LINES=""
for svc in "${SERVICES_ORDER[@]}"; do
  if [ -n "${SEEN[$svc]:-}" ]; then
    continue
  fi
  SEEN["$svc"]=1
  SERVICES_ORDER_DEDUPED+=("$svc")
  MAP_LINES+="${svc}=${MAP[$svc]}"$'\n'
done

export HEALTHCHECK_MAP="$MAP_LINES"
export APPLY="$APPLY"
export HC_INTERVAL="$HC_INTERVAL"
export HC_TIMEOUT="$HC_TIMEOUT"
export HC_RETRIES="$HC_RETRIES"
export HC_TEST_TEMPLATE="$HC_TEST_TEMPLATE"

log "Compose file: $COMPOSE_FILE"
log "Mappings: ${#MAP[@]}"

python3 - "$COMPOSE_FILE" <<'PY'
import os
import re
import sys

compose_path = sys.argv[1]
apply = os.environ.get("APPLY", "0") == "1"
interval = os.environ.get("HC_INTERVAL", "15s")
timeout = os.environ.get("HC_TIMEOUT", "5s")
retries = os.environ.get("HC_RETRIES", "5")
test_template = os.environ.get("HC_TEST_TEMPLATE", 'curl -sf "{url}"')

if "{url}" not in test_template:
    print("ERROR: --test-template must include {url}", file=sys.stderr)
    sys.exit(2)

mapping = {}
for line in os.environ.get("HEALTHCHECK_MAP", "").splitlines():
    line = line.strip()
    if not line:
        continue
    if "=" not in line:
        print(f"ERROR: invalid mapping line: {line}", file=sys.stderr)
        sys.exit(2)
    svc, url = line.split("=", 1)
    mapping[svc.strip()] = url.strip()

if not mapping:
    print("ERROR: no mappings provided", file=sys.stderr)
    sys.exit(2)

with open(compose_path, "rb") as f:
    raw = f.read()

has_trailing_newline = raw.endswith(b"\n")
lines = raw.decode("utf-8").splitlines()

svc_line_re = re.compile(r"^  ([A-Za-z0-9_.-]+):\s*(#.*)?$")
services_line_re = re.compile(r"^services:\s*(#.*)?$")

def is_top_level(line: str) -> bool:
    return bool(re.match(r"^[^\s]", line))

# Collect known services
known_services = []
seen = set()
in_services = False
for line in lines:
    if services_line_re.match(line):
        in_services = True
        continue
    if in_services and is_top_level(line) and not services_line_re.match(line):
        in_services = False
    if in_services:
        m = svc_line_re.match(line)
        if m:
            name = m.group(1)
            if name not in seen:
                known_services.append(name)
                seen.add(name)

unknown = [svc for svc in mapping.keys() if svc not in seen]
if unknown:
    print("ERROR: unknown services in mapping:", ", ".join(unknown), file=sys.stderr)
    sys.exit(2)

updated = []
skipped = []

new_lines = []
i = 0
in_services = False
while i < len(lines):
    line = lines[i]
    if not in_services:
        new_lines.append(line)
        if services_line_re.match(line):
            in_services = True
        i += 1
        continue

    if in_services and is_top_level(line) and not services_line_re.match(line):
        in_services = False
        continue

    m = svc_line_re.match(line)
    if not m:
        new_lines.append(line)
        i += 1
        continue

    svc = m.group(1)
    block = [line]
    i += 1
    while i < len(lines):
        next_line = lines[i]
        if svc_line_re.match(next_line):
            break
        if is_top_level(next_line) and not services_line_re.match(next_line):
            break
        block.append(next_line)
        i += 1

    has_healthcheck = any(re.match(r"^    healthcheck:\s*(#.*)?$", l) for l in block)
    if svc in mapping and not has_healthcheck:
        url = mapping[svc]
        cmd = test_template.replace("{url}", url)
        if "exit" not in cmd:
            cmd = f"{cmd} || exit 1"
        insert_at = max((idx for idx, l in enumerate(block) if l.strip()), default=len(block) - 1) + 1
        healthcheck_block = [
            "    healthcheck:",
            "      test:",
            "        - CMD-SHELL",
            f"        - {cmd}",
            f"      interval: {interval}",
            f"      timeout: {timeout}",
            f"      retries: {retries}",
        ]
        block = block[:insert_at] + healthcheck_block + block[insert_at:]
        updated.append(svc)
    elif svc in mapping:
        skipped.append(svc)

    new_lines.extend(block)

if apply and updated:
    text = "\n".join(new_lines)
    if has_trailing_newline:
        text += "\n"
    with open(compose_path, "w", encoding="utf-8") as f:
        f.write(text)

if updated:
    print("ADD healthcheck:", ", ".join(updated))
if skipped:
    print("SKIP existing healthcheck:", ", ".join(skipped))
if not updated and not skipped:
    print("No matching services to update.")
PY

if [ "$DRY_RUN" -eq 1 ]; then
  log "Dry-run complete. Re-run with --apply to write changes."
fi

if [ "$RESTART" -eq 1 ]; then
  if [ "$APPLY" -eq 0 ]; then
    log "Restart requested without --apply; proceeding with existing healthchecks."
  fi
  for svc in "${SERVICES_ORDER_DEDUPED[@]}"; do
    log "Restarting $svc"
    docker compose -f "$COMPOSE_FILE" up -d --no-deps --force-recreate "$svc"

    local_deadline=$((SECONDS + WAIT_TIMEOUT))
    while [ $SECONDS -lt $local_deadline ]; do
      cid="$(docker compose -f "$COMPOSE_FILE" ps -q "$svc" || true)"
      if [ -z "$cid" ]; then
        die "No container found for service: $svc"
      fi
      status="$(docker inspect -f '{{.State.Health.Status}}' "$cid" 2>/dev/null || true)"
      if [ "$status" = "healthy" ]; then
        log "$svc healthy"
        break
      fi
      if [ "$status" = "unhealthy" ]; then
        die "$svc unhealthy"
      fi
      if [ -z "$status" ] || [ "$status" = "<no value>" ]; then
        die "$svc has no healthcheck; add one or run without --restart"
      fi
      sleep 2
    done
    if [ $SECONDS -ge $local_deadline ]; then
      die "Timed out waiting for $svc to become healthy"
    fi
  done
fi
