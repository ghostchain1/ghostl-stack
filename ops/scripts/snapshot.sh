#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SNAP_DIR=""
REQUIRE_DOCKER="false"

usage() {
  cat <<'USAGE'
Usage: snapshot.sh [--out <dir>] [--require-docker]
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --out) SNAP_DIR="$2"; shift 2;;
    --require-docker) REQUIRE_DOCKER="true"; shift;;
    -h|--help) usage; exit 0;;
    *) echo "Unknown argument: $1" >&2; exit 1;;
  esac
done

if [[ -z "$SNAP_DIR" ]]; then
  SNAP_DIR="$ROOT_DIR/ops/snapshots/$(date -u +%Y%m%d-%H%M%S)"
fi

mkdir -p "$SNAP_DIR/files" "$SNAP_DIR/compose" "$SNAP_DIR/inspect" "$SNAP_DIR/maps"

log() {
  printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

log "Snapshot directory: $SNAP_DIR"

mapfile -t compose_files < <(rg --files -g 'docker-compose*.yml' -g 'compose*.yml' -g '!**/node_modules/**' -g '!**/.git/**' -g '!**/dist/**' -g '!**/cache/**' -g '!**/data/**' -g '!**/backups/**' -g '!**/rollback/**' -g '!**/ops/snapshots/**' -g '!**/ops/docker/snapshots/**' -g '!**/infra/docker/_backup/**' "$ROOT_DIR" | sort)
mapfile -t env_files < <(rg --files -g '.env*' -g '!**/node_modules/**' -g '!**/.git/**' -g '!**/dist/**' -g '!**/cache/**' -g '!**/data/**' -g '!**/backups/**' -g '!**/rollback/**' -g '!**/ops/snapshots/**' -g '!**/ops/docker/snapshots/**' -g '!**/infra/docker/_backup/**' "$ROOT_DIR" | sort)
extra_files=(
  "$ROOT_DIR/services/stack.env"
  "$ROOT_DIR/services/.docker/config.json"
)
DOCKER_TIMEOUT="${DOCKER_INFO_TIMEOUT:-5}"
COMPOSE_TIMEOUT="${COMPOSE_CONFIG_TIMEOUT:-5}"
TIMEOUT_BIN="$(command -v timeout || true)"
HAS_DOCKER="false"
if command -v docker >/dev/null 2>&1; then
  if [[ -n "$TIMEOUT_BIN" ]]; then
    if "$TIMEOUT_BIN" "${DOCKER_TIMEOUT}s" docker info >/dev/null 2>&1; then
      HAS_DOCKER="true"
    fi
  else
    if docker info >/dev/null 2>&1; then
      HAS_DOCKER="true"
    fi
  fi
fi
if [[ "$HAS_DOCKER" != "true" && "$REQUIRE_DOCKER" == "true" ]]; then
  echo "Docker not available; refusing to snapshot with --require-docker." >&2
  exit 1
fi

python3 - "$SNAP_DIR/files.json" <<'PY'
import json,sys
json.dump([],open(sys.argv[1],"w"))
PY

record_file() {
  local src="$1"
  local dest="$2"
  python3 - "$SNAP_DIR/files.json" "$src" "$dest" <<'PY'
import json,sys
path=sys.argv[1]
entry={"source":sys.argv[2],"dest":sys.argv[3]}
items=json.load(open(path))
items.append(entry)
json.dump(items,open(path,"w"),indent=2)
PY
}

render_compose() {
  local slug="$1"
  local dir="$2"
  shift 2
  local -a files=("$@")
  local -a compose_cmd=(docker compose --project-directory "$dir")
  local cf
  for cf in "${files[@]}"; do
    compose_cmd+=(-f "$cf")
  done
  if [[ -n "$TIMEOUT_BIN" ]]; then
    if "$TIMEOUT_BIN" "${COMPOSE_TIMEOUT}s" "${compose_cmd[@]}" config --format json > "$SNAP_DIR/compose/${slug}.json" 2>"$SNAP_DIR/compose/${slug}.error.log"; then
      rm -f "$SNAP_DIR/compose/${slug}.error.log"
    else
      return 1
    fi
    if ! "$TIMEOUT_BIN" "${COMPOSE_TIMEOUT}s" "${compose_cmd[@]}" config --services > "$SNAP_DIR/compose/${slug}.services" 2>/dev/null; then
      return 2
    fi
  else
    if "${compose_cmd[@]}" config --format json > "$SNAP_DIR/compose/${slug}.json" 2>"$SNAP_DIR/compose/${slug}.error.log"; then
      rm -f "$SNAP_DIR/compose/${slug}.error.log"
    else
      return 1
    fi
    if ! "${compose_cmd[@]}" config --services > "$SNAP_DIR/compose/${slug}.services" 2>/dev/null; then
      return 2
    fi
  fi
  return 0
}

compose_slug() {
  local src="$1"
  local rel="${src#$ROOT_DIR/}"
  rel="${rel//\//__}"
  printf '%s' "$rel"
}

copy_file() {
  local src="$1"
  if [[ -f "$src" ]]; then
    local rel="${src#$ROOT_DIR/}"
    local dest="$SNAP_DIR/files/$rel"
    mkdir -p "$(dirname "$dest")"
    cp "$src" "$dest"
    record_file "$src" "$dest"
  fi
}

printf '%s\n' "${compose_files[@]}" > "$SNAP_DIR/compose-files.txt"
python3 - "$SNAP_DIR/compose-files.txt" "$SNAP_DIR/compose-index.json" <<'PY'
import json,sys,os
list_path=sys.argv[1]
out=sys.argv[2]
root=os.path.abspath(os.path.join(os.path.dirname(out),"..",".."))
items=[]
with open(list_path,"r") as fh:
    for line in fh:
        path=line.strip()
        if not path:
            continue
        rel=path
        if path.startswith(root + os.sep):
            rel=path[len(root)+1:]
        slug=rel.replace("/","__")
        items.append({"path": path, "rel": rel, "slug": slug})
json.dump(items,open(out,"w"),indent=2)
PY

compose_failures=0
for f in "${compose_files[@]}"; do
  copy_file "$f"
  slug="$(compose_slug "$f")"
  if [[ "$HAS_DOCKER" == "true" ]]; then
    dir=$(dirname "$f")
    if ! render_compose "$slug" "$dir" "$f"; then
      base_compose=""
      if [[ "$f" != "$dir/docker-compose.yml" && -f "$dir/docker-compose.yml" ]]; then
        base_compose="$dir/docker-compose.yml"
      elif [[ "$f" != "$dir/compose.yml" && -f "$dir/compose.yml" ]]; then
        base_compose="$dir/compose.yml"
      fi
      if [[ -n "$base_compose" ]]; then
        if ! render_compose "$slug" "$dir" "$base_compose" "$f"; then
          compose_failures=$((compose_failures+1))
        fi
      else
        compose_failures=$((compose_failures+1))
      fi
    fi
  fi
done
if [[ "$REQUIRE_DOCKER" == "true" && "$compose_failures" -gt 0 ]]; then
  echo "Compose rendering failed for ${compose_failures} file(s)." >&2
  exit 1
fi

for f in "${env_files[@]}"; do
  copy_file "$f"
done

for f in "${extra_files[@]}"; do
  copy_file "$f"
done

python3 - "$SNAP_DIR/restore-plan.json" <<'PY'
import json,sys,os,datetime
snap=os.path.dirname(sys.argv[1])
files=json.load(open(os.path.join(snap,"files.json")))
compose_files=[]
compose_path=os.path.join(snap,"compose-files.txt")
if os.path.isfile(compose_path):
    compose_files=open(compose_path).read().splitlines()
plan={
  "timestamp": os.path.basename(snap),
  "createdAt": datetime.datetime.utcnow().isoformat()+"Z",
  "files": files,
  "composeFiles": compose_files
}
json.dump(plan,open(sys.argv[1],"w"),indent=2)
PY

if [[ "$HAS_DOCKER" == "true" ]]; then
  log "Capturing Docker inventory"
  docker ps -a --format '{{json .}}' > "$SNAP_DIR/inspect/docker-ps.json"
  docker images --format '{{json .}}' > "$SNAP_DIR/inspect/docker-images.json"
  docker volume ls --format '{{json .}}' > "$SNAP_DIR/inspect/docker-volumes.json"
  docker network ls --format '{{json .}}' > "$SNAP_DIR/inspect/docker-networks.json"
  mapfile -t containers < <(docker ps -a -q)
  if [[ ${#containers[@]} -gt 0 ]]; then
    docker inspect "${containers[@]}" > "$SNAP_DIR/inspect/docker-inspect.json"
  else
    echo '[]' > "$SNAP_DIR/inspect/docker-inspect.json"
  fi
  mapfile -t volumes < <(docker volume ls -q)
  if [[ ${#volumes[@]} -gt 0 ]]; then
    docker volume inspect "${volumes[@]}" > "$SNAP_DIR/inspect/docker-volume-inspect.json"
  else
    echo '[]' > "$SNAP_DIR/inspect/docker-volume-inspect.json"
  fi

  python3 - "$SNAP_DIR/inspect/docker-inspect.json" "$SNAP_DIR/inspect/docker-volume-inspect.json" "$SNAP_DIR/maps/port-map.json" "$SNAP_DIR/maps/mount-map.json" "$SNAP_DIR/maps/volume-map.json" "$SNAP_DIR/maps/chain-data-map.json" <<'PY'
import json,sys
inspect_path, volume_path, port_out, mount_out, volume_out, chain_out = sys.argv[1:7]
data=json.load(open(inspect_path))
volumes=json.load(open(volume_path))
port_map=[]
mount_map=[]
volume_map=[]
chain_map=[]

chain_tokens=("geth","op-geth","op-node","chaindata","datadir","l1","l2","l3","execution","consensus","polygon-edge","rollup","jwt","genesis","db")
volume_mounts={v.get("Name"):v.get("Mountpoint") for v in volumes if v.get("Name")}

for item in data:
    name=item.get("Name","").lstrip("/")
    labels=item.get("Config",{}).get("Labels",{}) or {}
    svc=labels.get("com.docker.compose.service","")
    project=labels.get("com.docker.compose.project","")
    ports=item.get("NetworkSettings",{}).get("Ports",{}) or {}
    for container_port, bindings in ports.items():
        if not bindings:
            continue
        for binding in bindings:
            port_map.append({
                "container": name,
                "service": svc,
                "project": project,
                "containerPort": container_port,
                "hostIp": binding.get("HostIp",""),
                "hostPort": binding.get("HostPort",""),
            })
    mounts=item.get("Mounts",[]) or []
    for mount in mounts:
        source=mount.get("Source","")
        name=mount.get("Name","")
        host_path=source or (volume_mounts.get(name) if name else "")
        entry={
            "container": name,
            "service": svc,
            "project": project,
            "type": mount.get("Type",""),
            "name": name,
            "source": source,
            "destination": mount.get("Destination",""),
            "mode": mount.get("Mode",""),
            "rw": bool(mount.get("RW", False)),
            "hostPath": host_path,
        }
        mount_map.append(entry)
        dest=(entry.get("destination","") or "").lower()
        src=(entry.get("source","") or "").lower()
        if any(token in dest or token in src for token in chain_tokens):
            chain_map.append(entry)
        if name:
            volume_map.append({
                "volume": name,
                "container": entry.get("container"),
                "service": entry.get("service"),
                "project": entry.get("project"),
                "hostPath": host_path
            })

json.dump(port_map,open(port_out,"w"),indent=2)
json.dump(mount_map,open(mount_out,"w"),indent=2)
json.dump(volume_map,open(volume_out,"w"),indent=2)
json.dump(chain_map,open(chain_out,"w"),indent=2)
PY
else
  if [[ "$REQUIRE_DOCKER" == "true" ]]; then
    echo "Docker not available; refusing to complete snapshot." >&2
    exit 1
  fi
  log "Docker not available; skipping runtime inventory."
  echo '[]' > "$SNAP_DIR/inspect/docker-ps.json"
  echo '[]' > "$SNAP_DIR/inspect/docker-images.json"
  echo '[]' > "$SNAP_DIR/inspect/docker-volumes.json"
  echo '[]' > "$SNAP_DIR/inspect/docker-networks.json"
  echo '[]' > "$SNAP_DIR/inspect/docker-inspect.json"
  echo '[]' > "$SNAP_DIR/inspect/docker-volume-inspect.json"
  echo '[]' > "$SNAP_DIR/maps/port-map.json"
  echo '[]' > "$SNAP_DIR/maps/mount-map.json"
  echo '[]' > "$SNAP_DIR/maps/volume-map.json"
  echo '[]' > "$SNAP_DIR/maps/chain-data-map.json"
fi

log "Snapshot complete."
echo "$SNAP_DIR"
