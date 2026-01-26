#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPORT_JSON="$ROOT_DIR/update-report.json"
REPORT_MD="$ROOT_DIR/update-report.md"
REPORT_NDJSON="$(mktemp)"

log() {
  printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

cleanup() {
  rm -f "$REPORT_NDJSON"
}
trap cleanup EXIT

if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon is not running. Start Docker and re-run." >&2
  exit 1
fi

ARCH="$(docker info --format '{{.Architecture}}' 2>/dev/null || uname -m)"
log "Host architecture: ${ARCH}"

ABORT=0

mapfile -t running_config_files < <(docker ps --format '{{.Label "com.docker.compose.project.config_files"}}' | tr ',' '\n' | sed '/^$/d' | sort -u)

config_in_running() {
  local file="$1"
  local file_real file_base
  file_real=$(realpath "$file" 2>/dev/null || echo "$file")
  file_base=$(basename "$file")
  for cfg in "${running_config_files[@]}"; do
    if [[ "$cfg" == *"$file_real"* ]]; then
      return 0
    fi
    if [[ "$file_base" != "docker-compose.yml" && "$cfg" == *"$file_base"* ]]; then
      return 0
    fi
  done
  return 1
}

has_running_override() {
  local dir="$1"
  local override
  for override in "$dir"/docker-compose.*.yml; do
    [[ "$override" == "$dir/docker-compose.yml" ]] && continue
    [[ -f "$override" ]] || continue
    if config_in_running "$override"; then
      return 0
    fi
  done
  return 1
}

mapfile -t compose_files < <(rg --files -g 'docker-compose*.yml' "$ROOT_DIR" | sort)
if [[ ${#compose_files[@]} -eq 0 ]]; then
  echo "No docker-compose files found." >&2
  exit 1
fi

# Order compose files by infrastructure -> L1 -> L2 -> L3 -> UI/aux, preserving per-file dependency order.
compose_priority() {
  local file="$1"
  case "$file" in
    *observability*|*monitor* ) echo 0;;
    *logging* ) echo 1;;
    *gateway*|*proxy*|*ingress* ) echo 2;;
    *infra/ghostchain* ) echo 3;;
    *infra/opstack*/*l3*|*docker-compose.l3.yml* ) echo 5;;
    *infra/opstack* ) echo 4;;
    *services/*/docker-compose.yml*|*core-service/docker-compose.yml* ) echo 6;;
    *docker-compose.dev.yml*|*docker-compose.yml* ) echo 7;;
    * ) echo 8;;
  esac
}

mapfile -t sorted_compose_files < <(
  for file in "${compose_files[@]}"; do
    printf '%s\t%s\n' "$(compose_priority "$file")" "$file"
  done | sort -n -k1,1 -k2,2 | cut -f2-
)

record_entry() {
  printf '%s\n' "$1" >> "$REPORT_NDJSON"
}

service_meta() {
  local config_file="$1"
  local service="$2"
  python3 - "$config_file" "$service" <<'PY'
import json
import sys

config = json.load(open(sys.argv[1]))
service = sys.argv[2]
svc = config.get('services', {}).get(service, {})
image = svc.get('image', '') or ''
has_build = '1' if 'build' in svc else '0'
print(f"{image}|{has_build}")
PY
}

services_order() {
  local config_file="$1"
  python3 - "$config_file" <<'PY'
import json
import sys

config = json.load(open(sys.argv[1]))
services = config.get('services', {})
order = list(services.keys())

deps = {}
for name, svc in services.items():
    dep = svc.get('depends_on', [])
    if isinstance(dep, dict):
        deps[name] = list(dep.keys())
    elif isinstance(dep, list):
        deps[name] = dep
    else:
        deps[name] = []

indeg = {name: 0 for name in order}
for name, ds in deps.items():
    for d in ds:
        if d in indeg:
            indeg[name] += 1

queue = [name for name in order if indeg[name] == 0]
result = []

while queue:
    node = queue.pop(0)
    result.append(node)
    for name in order:
        if node in deps.get(name, []):
            indeg[name] -= 1
            if indeg[name] == 0:
                queue.append(name)

if len(result) != len(order):
    result = order

print("\n".join(result))
PY
}

check_health() {
  local container_id="$1"
  local timeout="$2"
  local start
  start=$(date +%s)

  while true; do
    local status health
    status=$(docker inspect --format '{{.State.Status}}' "$container_id" 2>/dev/null || echo "")
    health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$container_id" 2>/dev/null || echo "")

    if [[ "$status" == "running" ]]; then
      if [[ -z "$health" || "$health" == "healthy" ]]; then
        return 0
      fi
      if [[ "$health" == "unhealthy" ]]; then
        return 1
      fi
    elif [[ "$status" == "exited" || "$status" == "dead" ]]; then
      return 1
    fi

    if (( $(date +%s) - start > timeout )); then
      return 1
    fi
    sleep 5
  done
}

check_logs_stable() {
  local container_id="$1"
  sleep 30
  local logs
  logs=$(docker logs --since 60s --tail=200 "$container_id" 2>&1 || true)
  if echo "$logs" | rg -i "panic|fatal|segmentation fault|uncaught|unhandled|crash|exit code" | rg -vi "connection to client lost|terminating connection due to administrator command" >/dev/null; then
    return 1
  fi
  return 0
}

has_fatal_logs() {
  local container_id="$1"
  local logs
  logs=$(docker logs --since 60s --tail=200 "$container_id" 2>&1 || true)
  if echo "$logs" | rg -i "panic|fatal|segmentation fault|uncaught|unhandled|crash|exit code" | rg -vi "connection to client lost|terminating connection due to administrator command" >/dev/null; then
    return 0
  fi
  return 1
}

update_service() {
  local file="$1"
  local dir="$2"
  local config_file="$3"
  local service="$4"
  shift 4
  local -a compose_args=("$@")

  local start_time end_time status rollback_status
  start_time=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  local container_id
  container_id=$(docker compose --project-directory "$dir" "${compose_args[@]}" ps -q "$service" 2>/dev/null || true)
  if [[ -z "$container_id" ]]; then
    status="skipped_not_running"
    end_time=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    record_entry "$(LOG_EXCERPT_B64="" python3 - <<PY
import base64
import json
import os
print(json.dumps({
  "service": "$service",
  "composeFile": "$file",
  "status": "$status",
  "startTime": "$start_time",
  "endTime": "$end_time",
  "logExcerpt": base64.b64decode(os.environ.get("LOG_EXCERPT_B64", "") or b"").decode("utf-8", "replace")
}))
PY
)"
    log "Skipping $service (not running)"
    return 0
  fi

  local config_files file_real file_base
  config_files=$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project.config_files"}}' "$container_id" 2>/dev/null || echo "")
  file_real=$(realpath "$file" 2>/dev/null || echo "$file")
  file_base=$(basename "$file")
  if [[ -n "$config_files" && "$config_files" != *"$file_real"* && "$config_files" != *"$file_base"* ]]; then
    status="skipped_not_owned"
    end_time=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    record_entry "$(LOG_EXCERPT_B64="" python3 - <<PY
import base64
import json
import os
print(json.dumps({
  "service": "$service",
  "composeFile": "$file",
  "status": "$status",
  "startTime": "$start_time",
  "endTime": "$end_time",
  "logExcerpt": base64.b64decode(os.environ.get("LOG_EXCERPT_B64", "") or b"").decode("utf-8", "replace")
}))
PY
)"
    log "Skipping $service (container owned by different compose file)"
    return 0
  fi

  local pre_status pre_health pre_log_excerpt
  pre_status=$(docker inspect --format '{{.State.Status}}' "$container_id" 2>/dev/null || echo "")
  pre_health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$container_id" 2>/dev/null || echo "")
  pre_log_excerpt=$(docker logs --tail=200 "$container_id" 2>&1 | tail -n 200 || true)

  if [[ "$pre_status" != "running" || "$pre_health" == "unhealthy" ]] || has_fatal_logs "$container_id"; then
    status="skipped_unhealthy"
    end_time=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    record_entry "$(LOG_EXCERPT_B64="$(printf '%s' "$pre_log_excerpt" | base64 -w 0)" python3 - <<PY
import base64
import json
import os
print(json.dumps({
  "service": "$service",
  "composeFile": "$file",
  "status": "$status",
  "startTime": "$start_time",
  "endTime": "$end_time",
  "logExcerpt": base64.b64decode(os.environ.get("LOG_EXCERPT_B64", "") or b"").decode("utf-8", "replace")
}))
PY
)"
    log "Skipping $service (pre-existing unhealthy state)"
    return 0
  fi

  local old_image_id old_image_ref
  old_image_id=$(docker inspect --format '{{.Image}}' "$container_id" 2>/dev/null || echo "")
  old_image_ref=$(docker inspect --format '{{.Config.Image}}' "$container_id" 2>/dev/null || echo "")

  local meta image_ref has_build
  meta=$(service_meta "$config_file" "$service")
  image_ref="${meta%%|*}"
  has_build="${meta##*|}"
  if [[ -z "$image_ref" ]]; then
    image_ref="$old_image_ref"
  fi

  log "Updating $service from $image_ref"

  if [[ -n "$image_ref" ]]; then
    docker pull "$image_ref" >/dev/null
  fi

  if [[ "$has_build" == "1" ]]; then
    docker compose --project-directory "$dir" "${compose_args[@]}" up -d --no-deps --build "$service" >/dev/null
  else
    docker compose --project-directory "$dir" "${compose_args[@]}" up -d --no-deps "$service" >/dev/null
  fi

  container_id=$(docker compose --project-directory "$dir" "${compose_args[@]}" ps -q "$service" 2>/dev/null || true)
  if [[ -z "$container_id" ]]; then
    status="failed"
  else
    if check_health "$container_id" 300 && check_logs_stable "$container_id"; then
      status="success"
    else
      status="failed"
    fi
  fi

  if [[ "$status" != "success" ]]; then
    log "Failure detected for $service, attempting rollback"
    rollback_status="rollback_failed"
    if [[ -n "$old_image_id" && -n "$old_image_ref" ]]; then
      docker image tag "$old_image_id" "$old_image_ref" >/dev/null 2>&1 || true
    fi
    if [[ "$has_build" == "1" ]]; then
      docker compose --project-directory "$dir" "${compose_args[@]}" up -d --no-deps --build "$service" >/dev/null 2>&1 || true
    else
      docker compose --project-directory "$dir" "${compose_args[@]}" up -d --no-deps "$service" >/dev/null 2>&1 || true
    fi
    container_id=$(docker compose --project-directory "$dir" "${compose_args[@]}" ps -q "$service" 2>/dev/null || true)
    if [[ -n "$container_id" ]] && check_health "$container_id" 120; then
      rollback_status="rolled_back"
      status="rolled_back"
    fi
  fi

  end_time=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  local new_image_ref new_image_id log_excerpt
  new_image_ref=$(docker inspect --format '{{.Config.Image}}' "$container_id" 2>/dev/null || echo "")
  new_image_id=$(docker inspect --format '{{.Image}}' "$container_id" 2>/dev/null || echo "")
  log_excerpt=$(docker logs --tail=200 "$container_id" 2>&1 | tail -n 200 || true)

  record_entry "$(LOG_EXCERPT_B64="$(printf '%s' "$log_excerpt" | base64 -w 0)" python3 - <<PY
import base64
import json
import os
print(json.dumps({
  "service": "$service",
  "composeFile": "$file",
  "status": "$status",
  "startTime": "$start_time",
  "endTime": "$end_time",
  "oldImage": "$old_image_ref",
  "oldImageId": "$old_image_id",
  "newImage": "$new_image_ref",
  "newImageId": "$new_image_id",
  "rollbackStatus": "${rollback_status:-}",
  "logExcerpt": base64.b64decode(os.environ.get("LOG_EXCERPT_B64", "") or b"").decode("utf-8", "replace")
}))
PY
)"

  if [[ "$status" != "success" ]]; then
    log "Update failed for $service. Aborting remaining updates."
    ABORT=1
    return 1
  fi

  log "Updated $service successfully"
}

for file in "${sorted_compose_files[@]}"; do
  dir=$(dirname "$file")
  if ! config_in_running "$file"; then
    log "Skipping compose file (no running containers): $file"
    continue
  fi

  if [[ "$(basename "$file")" == "docker-compose.yml" ]] && has_running_override "$dir"; then
    log "Skipping base compose (overrides active): $file"
    continue
  fi

  compose_args=()
  if [[ "$(basename "$file")" != "docker-compose.yml" && -f "$dir/docker-compose.yml" ]]; then
    compose_args+=(-f "$dir/docker-compose.yml")
  fi
  compose_args+=(-f "$file")
  if [[ -f "$dir/docker-compose.override.yml" ]] && config_in_running "$dir/docker-compose.override.yml"; then
    compose_args+=(-f "$dir/docker-compose.override.yml")
  fi

  log "Loading compose config: $file"
  if ! config_json=$(docker compose --project-directory "$dir" "${compose_args[@]}" config --format json 2>/tmp/compose-config-error.log); then
    end_time=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    log_excerpt=$(cat /tmp/compose-config-error.log 2>/dev/null || true)
    record_entry "$(LOG_EXCERPT_B64="$(printf '%s' "$log_excerpt" | base64 -w 0)" python3 - <<PY
import base64
import json
import os
print(json.dumps({
  "service": "compose-config",
  "composeFile": "$file",
  "status": "failed",
  "startTime": "$end_time",
  "endTime": "$end_time",
  "logExcerpt": base64.b64decode(os.environ.get("LOG_EXCERPT_B64", "") or b"").decode("utf-8", "replace")
}))
PY
)"
    log "Failed to load compose config for $file. Aborting."
    ABORT=1
    break
  fi

  config_file=$(mktemp)
  printf '%s' "$config_json" > "$config_file"

  mapfile -t services < <(services_order "$config_file")
  if [[ ${#services[@]} -eq 0 ]]; then
    log "No services found in $file"
    rm -f "$config_file"
    continue
  fi

  for service in "${services[@]}"; do
    update_service "$file" "$dir" "$config_file" "$service" "${compose_args[@]}" || true
    if [[ "$ABORT" == "1" ]]; then
      break
    fi
  done

  rm -f "$config_file"
  log "Completed updates for $file"
  if [[ "$ABORT" == "1" ]]; then
    break
  fi
done

python3 - "$REPORT_NDJSON" "$REPORT_JSON" "$REPORT_MD" <<'PY'
import json
import sys
from datetime import datetime

ndjson_path, json_path, md_path = sys.argv[1], sys.argv[2], sys.argv[3]
items = []
with open(ndjson_path, 'r') as fh:
    for line in fh:
        line = line.strip()
        if line:
            items.append(json.loads(line))

with open(json_path, 'w') as fh:
    json.dump(items, fh, indent=2)

lines = []
lines.append('# Sequential Update Report')
lines.append('')
lines.append(f'Generated: {datetime.utcnow().isoformat()}Z')
lines.append('')
lines.append('| Service | Status | Old Image | New Image | Started | Ended |')
lines.append('| --- | --- | --- | --- | --- | --- |')
for item in items:
    lines.append(
        f"| {item.get('service','')} | {item.get('status','')} | {item.get('oldImage','')} | {item.get('newImage','')} | {item.get('startTime','')} | {item.get('endTime','')} |"
    )

lines.append('')
lines.append('## Failures')
lines.append('')
failures = [i for i in items if i.get('status') in ('failed', 'rolled_back')]
if not failures:
    lines.append('No failures detected.')
else:
    for item in failures:
        lines.append(f"### {item.get('service','')}")
        lines.append('')
        lines.append(f"Status: {item.get('status','')}")
        if item.get('rollbackStatus'):
            lines.append(f"Rollback: {item.get('rollbackStatus')}")
        lines.append('')
        lines.append('```')
        lines.append(item.get('logExcerpt',''))
        lines.append('```')
        lines.append('')

with open(md_path, 'w') as fh:
    fh.write("\n".join(lines))
PY

log "Update report written to $REPORT_JSON and $REPORT_MD"

if [[ "$ABORT" == "1" ]]; then
  exit 1
fi
