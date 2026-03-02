#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODE="dev"
SNAPSHOT_DIR=""
PENDING_DIR="${SATELLITE_PENDING_DIR:-$ROOT_DIR/ops/satellite/pending}"
OUT_DIR="$ROOT_DIR/ops/satellite"

usage() {
  cat <<'USAGE'
Usage: sync.sh --snapshot <dir> [--mode dev|prod] [--pending <dir>]
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --snapshot) SNAPSHOT_DIR="$2"; shift 2;;
    --mode) MODE="$2"; shift 2;;
    --pending) PENDING_DIR="$2"; shift 2;;
    -h|--help) usage; exit 0;;
    *) echo "Unknown argument: $1" >&2; exit 1;;
  esac
done

if [[ -z "$SNAPSHOT_DIR" ]]; then
  echo "Missing --snapshot" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

python3 - "$SNAPSHOT_DIR" "$PENDING_DIR" "$OUT_DIR" "$MODE" "$ROOT_DIR" <<'PY'
import json,sys,os,datetime,hashlib

snap=sys.argv[1]
pending_dir=sys.argv[2]
out_dir=sys.argv[3]
mode=sys.argv[4]
root=sys.argv[5]

def sha256(path):
    h=hashlib.sha256()
    with open(path,"rb") as f:
        h.update(f.read())
    return h.hexdigest()

recursive_path=os.path.join(root,"ops/zk/recursive-proof.json")
recursive_hash=sha256(recursive_path) if os.path.isfile(recursive_path) else None

entries=[]
if os.path.isdir(pending_dir):
    for name in sorted(os.listdir(pending_dir)):
        if not name.endswith(".json"):
            continue
        path=os.path.join(pending_dir,name)
        try:
            data=json.load(open(path))
        except Exception:
            continue
        data["sourceFile"]=name
        entries.append(data)

issues=[]
severity="WARN"
status="skipped"
max_age_hours=int(os.getenv("SATELLITE_MAX_AGE_HOURS","72"))
seen=set()

def bump(level):
    nonlocal severity
    order=["INFO","WARN","CRITICAL"]
    if order.index(level)>order.index(severity):
        severity=level

valid=[]
for item in entries:
    nonce=item.get("nonce")
    if nonce in seen:
        issues.append({"code":"duplicate_nonce","severity":"WARN","detail":nonce})
        continue
    seen.add(nonce)
    ts=item.get("timestamp")
    try:
        dt=datetime.datetime.fromisoformat(ts.replace("Z","+00:00"))
        age=(datetime.datetime.utcnow().replace(tzinfo=dt.tzinfo)-dt).total_seconds()/3600.0
        if age>max_age_hours:
            issues.append({"code":"stale_attestation","severity":"WARN","detail":nonce})
    except Exception:
        issues.append({"code":"invalid_timestamp","severity":"WARN","detail":nonce})

    if recursive_hash and item.get("recursiveProofHash") and item.get("recursiveProofHash")!=recursive_hash:
        issues.append({"code":"recursive_hash_mismatch","severity":"CRITICAL","detail":nonce})
        bump("CRITICAL")
        continue

    if not item.get("signature"):
        issues.append({"code":"missing_signature","severity":"WARN","detail":nonce})
    valid.append(item)

if valid:
    status="synced"
    severity="INFO" if severity!="CRITICAL" else "CRITICAL"

report={
  "timestamp": datetime.datetime.utcnow().isoformat()+"Z",
  "mode": mode,
  "status": status,
  "severity": severity,
  "recursiveProofHash": recursive_hash,
  "attestations": valid,
  "issues": issues
}

sync_log={
  "timestamp": report["timestamp"],
  "mode": mode,
  "received": len(entries),
  "accepted": len(valid),
  "issues": issues
}

json.dump(report,open(os.path.join(out_dir,"offline-attestations.json"),"w"),indent=2)
json.dump(sync_log,open(os.path.join(out_dir,"sync-log.json"),"w"),indent=2)
PY

cp "$OUT_DIR/offline-attestations.json" "$SNAPSHOT_DIR/offline-attestations.json"
cp "$OUT_DIR/sync-log.json" "$SNAPSHOT_DIR/sync-log.json"
