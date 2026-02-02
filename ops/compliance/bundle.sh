#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SNAPSHOT_DIR=""
OUT_PATH="$ROOT_DIR/ops/compliance/evidence-bundle.json"
MAP_PATH="$ROOT_DIR/ops/compliance/controls-map.json"

usage() {
  cat <<'USAGE'
Usage: bundle.sh --snapshot <dir> [--out <path>] [--map <path>]
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --snapshot) SNAPSHOT_DIR="$2"; shift 2;;
    --out) OUT_PATH="$2"; shift 2;;
    --map) MAP_PATH="$2"; shift 2;;
    -h|--help) usage; exit 0;;
    *) echo "Unknown argument: $1" >&2; exit 1;;
  esac
done

if [[ -z "$SNAPSHOT_DIR" ]]; then
  echo "Missing --snapshot" >&2
  exit 1
fi

python3 - "$ROOT_DIR" "$SNAPSHOT_DIR" "$MAP_PATH" "$OUT_PATH" <<'PY'
import hashlib,json,os,sys,datetime

root=sys.argv[1]
snap=sys.argv[2]
map_path=sys.argv[3]
out_path=sys.argv[4]

def sha256(path):
    h=hashlib.sha256()
    with open(path,"rb") as f:
        h.update(f.read())
    return h.hexdigest()

mapping=json.load(open(map_path))
bundle={
  "timestamp": datetime.datetime.utcnow().isoformat()+"Z",
  "snapshot": snap,
  "controls": []
}

for control in mapping.get("controls",[]):
    artifacts=[]
    for ref in control.get("artifacts",[]):
        abs_path=os.path.join(root,ref)
        if os.path.isdir(abs_path):
            artifacts.append({"path": ref, "type": "directory"})
            continue
        if os.path.isfile(abs_path):
            artifacts.append({"path": ref, "sha256": sha256(abs_path)})
    bundle["controls"].append({
        "id": control.get("id"),
        "description": control.get("description"),
        "artifacts": artifacts
    })

json.dump(bundle,open(out_path,"w"),indent=2)
PY

cp "$OUT_PATH" "$SNAPSHOT_DIR/evidence-bundle.json"
