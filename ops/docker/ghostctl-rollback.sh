#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SNAPSHOT_DIR="${1:-}"

abort() {
  echo "ERROR: $*" >&2
  exit 1
}

if [[ -z "$SNAPSHOT_DIR" ]]; then
  abort "Usage: ghostctl-rollback.sh <snapshot-dir>"
fi

if [[ ! -d "$SNAPSHOT_DIR" ]]; then
  abort "Snapshot directory not found: $SNAPSHOT_DIR"
fi

if ! docker info >/dev/null 2>&1; then
  abort "Docker daemon is not running."
fi

compose_list="$SNAPSHOT_DIR/compose-files.txt"
if [[ ! -f "$compose_list" ]]; then
  abort "Missing compose file list in snapshot."
fi

mapfile -t compose_files < "$compose_list"

for file in "${compose_files[@]}"; do
  rel="${file#"$ROOT_DIR/"}"
  snapshot_file="$SNAPSHOT_DIR/compose/$rel"
  if [[ ! -f "$snapshot_file" ]]; then
    abort "Missing snapshot compose file: $snapshot_file"
  fi
  dir=$(dirname "$snapshot_file")
  docker compose --project-directory "$dir" -f "$snapshot_file" up -d
 done

CHAIN_CONFIG_PATH="${GHOST_CHAIN_CONFIG_PATH:-$ROOT_DIR/services/ghost-pil/config/chains.json}"
if [[ ! -f "$CHAIN_CONFIG_PATH" ]]; then
  CHAIN_CONFIG_PATH="$ROOT_DIR/services/ghost-gas-engine/config/chains.json"
fi
if [[ ! -f "$CHAIN_CONFIG_PATH" ]]; then
  abort "Chain config file not found. Set GHOST_CHAIN_CONFIG_PATH."
fi

python3 - "$CHAIN_CONFIG_PATH" "$SNAPSHOT_DIR/chain-status-rollback.json" <<'PY'
import json,sys,urllib.request

chain_path=sys.argv[1]
out_path=sys.argv[2]

chains=json.load(open(chain_path)).get("chains",[])

def rpc_call(url, method):
    payload={"jsonrpc":"2.0","id":1,"method":method,"params":[]}
    data=json.dumps(payload).encode()
    req=urllib.request.Request(url,data=data,headers={"Content-Type":"application/json"})
    with urllib.request.urlopen(req,timeout=5) as resp:
        return json.load(resp)

results=[]
for chain in chains:
    url=chain.get("rpcUrl") or chain.get("rpc")
    entry={"chainId":chain.get("chainId"),"chainKey":chain.get("key"),"rpcUrl":url}
    if not url:
        entry["error"]="missing_rpc"
        results.append(entry)
        continue
    try:
        chain_id=rpc_call(url,"eth_chainId").get("result")
        block=rpc_call(url,"eth_blockNumber").get("result")
        entry["rpcChainId"]=chain_id
        entry["blockNumber"]=block
    except Exception as exc:
        entry["error"]=str(exc)
    results.append(entry)

json.dump({"chains":results},open(out_path,"w"),indent=2)
PY

python3 - "$SNAPSHOT_DIR/chain-status-pre.json" "$SNAPSHOT_DIR/chain-status-rollback.json" <<'PY'
import json,sys

pre=json.load(open(sys.argv[1]))
post=json.load(open(sys.argv[2]))

pre_map={c.get("chainKey"):c for c in pre.get("chains",[])}
post_map={c.get("chainKey"):c for c in post.get("chains",[])}

for key,pre_entry in pre_map.items():
    post_entry=post_map.get(key)
    if not post_entry:
        raise SystemExit(f"Missing chain status for {key}")
    if pre_entry.get("rpcChainId") and post_entry.get("rpcChainId") and pre_entry["rpcChainId"]!=post_entry["rpcChainId"]:
        raise SystemExit(f"ChainId changed for {key}")
    if pre_entry.get("blockNumber") and post_entry.get("blockNumber"):
        pre_block=int(pre_entry["blockNumber"],16)
        post_block=int(post_entry["blockNumber"],16)
        if post_block < pre_block:
            raise SystemExit(f"Block height reduced for {key}")
PY

python3 - "$SNAPSHOT_DIR/chain-data-map.json" "$SNAPSHOT_DIR/chain-data-fingerprints.json" <<'PY'
import hashlib, json, os, sys

map_path=sys.argv[1]
reference_path=sys.argv[2]

exclude_suffixes=(".ipc", ".lock", ".log", ".tmp")
exclude_names=("LOCK", "lock")

payload=json.load(open(map_path))
entries=payload.get("entries",[])

fingerprints={}
for entry in entries:
    source=entry.get("source")
    if not source:
        continue
    if source.startswith("/"):
        root=source
    else:
        try:
            import subprocess
            result=subprocess.check_output(["docker","volume","inspect",source,"--format","{{ .Mountpoint }}"],text=True).strip()
            root=result
        except Exception:
            continue
    if not os.path.exists(root):
        continue
    hashes={}
    for dirpath,_,filenames in os.walk(root):
        for name in filenames:
            if name in exclude_names:
                continue
            if name.endswith(exclude_suffixes):
                continue
            path=os.path.join(dirpath,name)
            rel=os.path.relpath(path,root)
            h=hashlib.sha256()
            with open(path,"rb") as f:
                for chunk in iter(lambda:f.read(1024*1024),b""):
                    h.update(chunk)
            hashes[rel]=h.hexdigest()
    fingerprints[source]={"root":root,"fileHashes":hashes}

reference=json.load(open(reference_path)).get("fingerprints",{})
if fingerprints!=reference:
    raise SystemExit("Chain data fingerprint mismatch during rollback")
PY

echo "Rollback completed using snapshot $SNAPSHOT_DIR"
