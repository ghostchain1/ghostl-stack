#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SNAPSHOT=""
STOP_UNKNOWN="false"
HEALTH_CHECK="false"
HEALTH_TIMEOUT=300

# shellcheck source=scripts/lib/docker.sh
. "${ROOT_DIR}/scripts/lib/docker.sh"

usage() {
  cat <<'USAGE'
Usage: rollback.sh [--stop-unknown] [--health-check] [--timeout <seconds>] /path/to/ops/snapshots/<timestamp>
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --stop-unknown) STOP_UNKNOWN="true"; shift;;
    --health-check) HEALTH_CHECK="true"; shift;;
    --timeout) HEALTH_TIMEOUT="$2"; shift 2;;
    -h|--help) usage; exit 0;;
    *)
      if [[ -z "$SNAPSHOT" ]]; then
        SNAPSHOT="$1"; shift
      else
        echo "Unknown argument: $1" >&2
        usage
        exit 1
      fi
      ;;
  esac
done

if [[ -z "$SNAPSHOT" ]]; then
  usage
  exit 1
fi

if [[ ! -f "$SNAPSHOT/restore-plan.json" ]]; then
  echo "Missing restore-plan.json in snapshot" >&2
  exit 1
fi

log() {
  printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

log "Restoring files from $SNAPSHOT"

python3 - "$SNAPSHOT/restore-plan.json" "$ROOT_DIR" <<'PY'
import json,sys,os,shutil
plan=json.load(open(sys.argv[1]))
root=sys.argv[2]
for entry in plan.get("files",[]):
    src=entry.get("dest")
    dst=entry.get("source")
    if not src or not dst:
        continue
    if not os.path.isfile(src):
        continue
    os.makedirs(os.path.dirname(dst),exist_ok=True)
    shutil.copy2(src,dst)
PY

log "Files restored. Restarting affected compose services."

if ! hg_docker info >/dev/null 2>&1; then
  log "Docker not available; skipping restart."
  exit 0
fi

if [[ "$STOP_UNKNOWN" == "true" && -f "$SNAPSHOT/inspect/docker-ps.json" ]]; then
  log "Stopping containers not present in snapshot."
  mapfile -t snapshot_containers < <(python3 - "$SNAPSHOT/inspect/docker-ps.json" <<'PY'
import json,sys
names=[]
with open(sys.argv[1],"r") as fh:
    for line in fh:
        line=line.strip()
        if not line:
            continue
        try:
            obj=json.loads(line)
        except json.JSONDecodeError:
            continue
        name=obj.get("Names")
        if name:
            names.append(name)
print("\n".join(names))
PY
)
  mapfile -t current_containers < <(hg_docker ps -a --format '{{.Names}}')
  for name in "${current_containers[@]}"; do
    if [[ -z "$name" ]]; then
      continue
    fi
    if [[ ! " ${snapshot_containers[*]} " =~ " ${name} " ]]; then
      log "Stopping unknown container: $name"
      hg_docker stop "$name" >/dev/null 2>&1 || true
    fi
  done
fi

check_health() {
  local container_id="$1"
  local timeout="$2"
  local start
  start=$(date +%s)
  while true; do
    local status health
    status=$(hg_docker inspect --format '{{.State.Status}}' "$container_id" 2>/dev/null || echo "")
    health=$(hg_docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$container_id" 2>/dev/null || echo "")
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

compose_dir="$SNAPSHOT/compose"
compose_index="$SNAPSHOT/compose-index.json"
declare -A compose_lookup
if [[ -f "$compose_index" ]]; then
  while IFS= read -r line; do
    slug="${line%%|*}"
    rel="${line##*|}"
    if [[ -n "$slug" && -n "$rel" ]]; then
      compose_lookup["$slug"]="$rel"
    fi
  done < <(python3 - "$compose_index" <<'PY'
import json,sys
items=json.load(open(sys.argv[1]))
for item in items:
    slug=item.get("slug","")
    rel=item.get("rel","")
    if slug and rel:
        print(f"{slug}|{rel}")
PY
)
fi
restarted_containers=()
if [[ -d "$compose_dir" ]]; then
  for services_file in "$compose_dir"/*.services; do
    [[ -f "$services_file" ]] || continue
    compose_base="$(basename "$services_file" .services)"
    compose_path=""
    if [[ -n "${compose_lookup[$compose_base]:-}" ]]; then
      compose_path="$ROOT_DIR/${compose_lookup[$compose_base]}"
    fi
    if [[ -z "$compose_path" ]]; then
      if [[ -f "$ROOT_DIR/$compose_base.yml" ]]; then
        compose_path="$ROOT_DIR/$compose_base.yml"
      else
        compose_path=$(rg --files -g "$compose_base.yml" "$ROOT_DIR" | head -n1)
      fi
    fi
    if [[ -z "$compose_path" ]]; then
      log "compose file for $compose_base not found; skipping"
      continue
    fi
    compose_dir_path="$(dirname "$compose_path")"
    while IFS= read -r service; do
      [[ -n "$service" ]] || continue
      log "Restarting $service from $compose_path"
      hg_docker compose --project-directory "$compose_dir_path" -f "$compose_path" up -d --no-deps "$service" || true
      if [[ "$HEALTH_CHECK" == "true" ]]; then
        cid=$(hg_docker compose --project-directory "$compose_dir_path" -f "$compose_path" ps -q "$service" 2>/dev/null || true)
        if [[ -n "$cid" ]]; then
          restarted_containers+=("$cid")
        fi
      fi
    done < "$services_file"
  done
fi

if [[ "$HEALTH_CHECK" == "true" && ${#restarted_containers[@]} -gt 0 ]]; then
  log "Verifying health for restarted containers."
  for cid in "${restarted_containers[@]}"; do
    if ! check_health "$cid" "$HEALTH_TIMEOUT"; then
      log "Health check failed for container $cid"
    fi
  done
  if [[ -x "$ROOT_DIR/ops/scripts/verify.sh" ]]; then
    log "Running strict health gates."
    "$ROOT_DIR/ops/scripts/verify.sh" --strict || true
  fi
fi

log "Rollback complete"
