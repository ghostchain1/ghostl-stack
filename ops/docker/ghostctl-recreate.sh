#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODE="dev"
ROLLING="false"
DRY_RUN="false"
YES="false"
NO_ROLLBACK="false"

usage() {
  cat <<'USAGE'
Usage: ghostctl-recreate.sh [--rolling] [--mode dev|prod] [--dry-run] [--yes] [--no-rollback]
USAGE
}

log() {
  printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

abort() {
  echo "ERROR: $*" >&2
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --rolling) ROLLING="true"; shift;;
    --mode)
      MODE="$2"; shift 2;;
    --dry-run) DRY_RUN="true"; shift;;
    --yes) YES="true"; shift;;
    --no-rollback) NO_ROLLBACK="true"; shift;;
    -h|--help) usage; exit 0;;
    *) abort "Unknown argument: $1";;
  esac
 done

if ! docker info >/dev/null 2>&1; then
  abort "Docker daemon is not running."
fi

TIMESTAMP="$(date -u +%Y%m%d-%H%M%S)"
SNAPSHOT_DIR="$ROOT_DIR/ops/docker/snapshots/$TIMESTAMP"
ATTEST_DIR="$ROOT_DIR/ops/docker/attestations"
mkdir -p "$SNAPSHOT_DIR" "$SNAPSHOT_DIR/compose" "$SNAPSHOT_DIR/env" "$SNAPSHOT_DIR/inspect" "$SNAPSHOT_DIR/proofs" "$ATTEST_DIR"

log "Snapshot directory: $SNAPSHOT_DIR"

mapfile -t compose_files < <(rg --files -g 'docker-compose*.yml' "$ROOT_DIR" | sort)
if [[ ${#compose_files[@]} -eq 0 ]]; then
  abort "No docker-compose files found."
fi

printf '%s\n' "${compose_files[@]}" > "$SNAPSHOT_DIR/compose-files.txt"

python3 - "$SNAPSHOT_DIR/restore-plan.json" <<'PY'
import json,sys,os
out_path=sys.argv[1]
plan={
  "timestamp": os.path.basename(os.path.dirname(out_path)),
  "mode": os.getenv("MODE","dev"),
  "composeFiles": open(os.path.join(os.path.dirname(out_path),"compose-files.txt")).read().splitlines(),
  "note": "Use ghostctl-rollback.sh to restore using the snapshot compose files."
}
json.dump(plan,open(out_path,"w"),indent=2)
PY

for file in "${compose_files[@]}"; do
  rel="${file#"$ROOT_DIR/"}"
  mkdir -p "$SNAPSHOT_DIR/compose/$(dirname "$rel")"
  cp "$file" "$SNAPSHOT_DIR/compose/$rel"
 done

mapfile -t env_files < <(rg --files -g '.env*' "$ROOT_DIR" | rg -v 'node_modules|\.git|dist|\.next')
for file in "${env_files[@]}"; do
  rel="${file#"$ROOT_DIR/"}"
  mkdir -p "$SNAPSHOT_DIR/env/$(dirname "$rel")"
  cp "$file" "$SNAPSHOT_DIR/env/$rel"
 done

log "Capturing Docker inventory"
docker ps -a --format '{{json .}}' > "$SNAPSHOT_DIR/inspect/docker-ps.json"
docker images --format '{{json .}}' > "$SNAPSHOT_DIR/inspect/docker-images.json"
docker volume ls --format '{{json .}}' > "$SNAPSHOT_DIR/inspect/docker-volumes.json"
docker network ls --format '{{json .}}' > "$SNAPSHOT_DIR/inspect/docker-networks.json"
mapfile -t containers < <(docker ps -a --format '{{.ID}}' --filter 'label=com.docker.compose.project')
if [[ ${#containers[@]} -gt 0 ]]; then
  docker inspect "${containers[@]}" > "$SNAPSHOT_DIR/inspect/docker-inspect.json"
else
  echo '[]' > "$SNAPSHOT_DIR/inspect/docker-inspect.json"
fi

rendered_configs=()
for file in "${compose_files[@]}"; do
  dir=$(dirname "$file")
  name=$(basename "$file")
  out="$SNAPSHOT_DIR/compose/rendered-${name%.yml}.json"
  if docker compose --project-directory "$dir" -f "$file" config --format json > "$out"; then
    rendered_configs+=("$out")
  else
    abort "Failed to render compose config for $file"
  fi
 done

CHAIN_CONFIG_PATH="${GHOST_CHAIN_CONFIG_PATH:-$ROOT_DIR/services/ghost-pil/config/chains.json}"
if [[ ! -f "$CHAIN_CONFIG_PATH" ]]; then
  CHAIN_CONFIG_PATH="$ROOT_DIR/services/ghost-gas-engine/config/chains.json"
fi
if [[ ! -f "$CHAIN_CONFIG_PATH" ]]; then
  abort "Chain config file not found. Set GHOST_CHAIN_CONFIG_PATH."
fi

python3 - "$CHAIN_CONFIG_PATH" "$SNAPSHOT_DIR/chain-status-pre.json" <<'PY'
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

if ! python3 - "$SNAPSHOT_DIR/chain-data-map.json" "${rendered_configs[@]}" <<'PY'
import json,sys

out_path=sys.argv[1]
configs=sys.argv[2:]

chain_keywords=("geth","op-geth","l1","l2","l3","sequencer","proposer","validator","rollup","node","chaindata","chain")

entries=[]
missing_storage=[]
for cfg in configs:
    payload=json.load(open(cfg))
    services=payload.get("services",{})
    volumes=payload.get("volumes",{})
    for name,svc in services.items():
        vols=svc.get("volumes",[])
        labels=svc.get("labels",{}) or {}
        is_chain_service=any(k in name.lower() for k in chain_keywords)
        if is_chain_service and not vols:
            missing_storage.append({"service": name})
        for vol in vols:
            source=None
            target=None
            mode=None
            if isinstance(vol,str):
                parts=vol.split(":")
                if len(parts)>=2:
                    source=parts[0]
                    target=parts[1]
                    if len(parts)>=3:
                        mode=parts[2]
            elif isinstance(vol,dict):
                source=vol.get("source")
                target=vol.get("target")
                mode=vol.get("read_only") and "ro" or "rw"
            if not source or not target:
                continue
            lower=source.lower()
            if any(k in lower for k in chain_keywords) or any(k in (target or "").lower() for k in chain_keywords):
                is_chain_service=True
            entries.append({
                "service":name,
                "source":source,
                "target":target,
                "mode":mode or "rw",
                "labels":labels,
                "chainCandidate":is_chain_service
            })

payload_out={"entries":entries,"volumes":volumes,"missingStorage":missing_storage}
json.dump(payload_out,open(out_path,"w"),indent=2)
if missing_storage:
    print(json.dumps({"error":"missing_storage","details":missing_storage},indent=2))
    sys.exit(2)
PY
then
  abort "Chain services without persistent storage detected. See JSON output above."
fi

if ! python3 - "$SNAPSHOT_DIR/chain-data-map.json" <<'PY'
import json,sys

req=[
  "com.ghostchain.data.type",
  "com.ghostchain.data.layer",
  "com.ghostchain.data.immutable",
  "com.ghostchain.recreate.allowed"
]

payload=json.load(open(sys.argv[1]))
entries=payload.get("entries",[])
missing=[]
for entry in entries:
    if not entry.get("chainCandidate"):
        continue
    labels=entry.get("labels",{}) or {}
    for key in req:
        if key not in labels:
            missing.append({"service":entry.get("service"),"missing":key})

if missing:
    print(json.dumps({"error":"missing_labels","details":missing},indent=2))
    sys.exit(2)
PY
then
  abort "Required chain data labels missing. See JSON output above."
fi

python3 - "$SNAPSHOT_DIR/chain-data-map.json" "$SNAPSHOT_DIR/chain-data-fingerprints.json" <<'PY'
import hashlib, json, os, sys

map_path=sys.argv[1]
out_path=sys.argv[2]

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
        # named volume, resolve mountpoint
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
    fingerprints[source]={
        "root":root,
        "fileHashes":hashes
    }

json.dump({"fingerprints":fingerprints},open(out_path,"w"),indent=2)
PY

python3 - "$ROOT_DIR" "$SNAPSHOT_DIR/gas-token.json" <<'PY'
import json,os,re,sys

root=sys.argv[1]
out_path=sys.argv[2]
address_env=os.getenv("GHOST_GAS_TOKEN_ADDRESS")

candidates=[]
for path in [
    "infra/opstack/config/l1-deployments.json",
    "infra/opstack/config/l1-deployments.custom.json",
    "infra/opstack/config/rollup.json",
    "infra/opstack/l3/ghostl3/config/rollup.json",
    "infra/opstack/l3/ghostl3/config/genesis.json",
    "infra/opstack/config/l1-chain.json"
]:
    full=os.path.join(root,path)
    if not os.path.isfile(full):
        continue
    try:
        data=json.load(open(full))
    except Exception:
        continue
    def scan(obj, prefix=""):
        if isinstance(obj,dict):
            for k,v in obj.items():
                scan(v, prefix+"/"+k)
        elif isinstance(obj,list):
            for idx,v in enumerate(obj):
                scan(v, prefix+f"[{idx}]")
        elif isinstance(obj,str) and re.match(r"^0x[a-fA-F0-9]{40}$", obj):
            candidates.append({"file":path,"address":obj})
    scan(data)

if address_env:
    candidates.append({"file":"env","address":address_env})

addresses={c["address"] for c in candidates}

result={"address": None, "sources": candidates, "uniqueAddresses": sorted(addresses)}
if len(addresses)==1:
    result["address"]=next(iter(addresses))

json.dump(result,open(out_path,"w"),indent=2)

if not result["address"]:
    sys.exit(3)
PY

python3 - "$SNAPSHOT_DIR/gas-token.json" <<'PY'
import json,sys

payload=json.load(open(sys.argv[1]))
address=payload.get("address")
if not address:
    print("Gas token address not detected")
    sys.exit(3)

addrs=payload.get("uniqueAddresses",[])
if len(addrs)!=1:
    print("Gas token address mismatch across configs")
    sys.exit(4)

sources=payload.get("sources",[])
l1_ok=any("l1" in s.get("file","") for s in sources)
l2_ok=any("l2" in s.get("file","") or "rollup" in s.get("file","") for s in sources)
l3_ok=any("l3" in s.get("file","") or "ghostl3" in s.get("file","") for s in sources)
if not (l1_ok and l2_ok and l3_ok):
    print("Gas token not referenced consistently in L1/L2/L3 configs")
    sys.exit(5)
PY

if rg -n "DEPLOY_GAS_TOKEN|REDEPLOY_GAS_TOKEN|GAS_TOKEN_DEPLOY" "$ROOT_DIR" >/dev/null; then
  abort "Gas token redeploy flags detected. Remove or disable before recreate."
fi

log "Snapshot captured"

if [[ "$DRY_RUN" == "true" ]]; then
  log "Dry run complete. No containers recreated."
  exit 0
fi

if [[ "$YES" != "true" ]]; then
  read -r -p "Proceed with container recreation? (yes/no) " answer
  if [[ "$answer" != "yes" ]]; then
    abort "Aborted by user."
  fi
fi

recreate_compose_file() {
  local file="$1"
  local dir
  dir=$(dirname "$file")

  if [[ "$ROLLING" == "true" ]]; then
    mapfile -t services < <(docker compose --project-directory "$dir" -f "$file" config --services)
    for svc in "${services[@]}"; do
      log "Recreating $svc via $file"
      docker compose --project-directory "$dir" -f "$file" up -d --no-deps --force-recreate "$svc"
    done
  else
    log "Recreating services via $file"
    docker compose --project-directory "$dir" -f "$file" up -d --force-recreate
  fi
}

for file in "${compose_files[@]}"; do
  recreate_compose_file "$file"
done

export MODE

python3 - "$CHAIN_CONFIG_PATH" "$SNAPSHOT_DIR/chain-status-post.json" <<'PY'
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

python3 - "$SNAPSHOT_DIR/chain-status-pre.json" "$SNAPSHOT_DIR/chain-status-post.json" <<'PY'
import json,sys

pre=json.load(open(sys.argv[1]))
post=json.load(open(sys.argv[2]))

pre_map={c.get("chainKey"):c for c in pre.get("chains",[])}
post_map={c.get("chainKey"):c for c in post.get("chains",[])}

for key,pre_entry in pre_map.items():
    post_entry=post_map.get(key)
    if not post_entry:
        raise SystemExit(f"Missing chain status post for {key}")
    if pre_entry.get("rpcChainId") and post_entry.get("rpcChainId") and pre_entry["rpcChainId"]!=post_entry["rpcChainId"]:
        raise SystemExit(f"ChainId changed for {key}")
    if pre_entry.get("blockNumber") and post_entry.get("blockNumber"):
        pre_block=int(pre_entry["blockNumber"],16)
        post_block=int(post_entry["blockNumber"],16)
        if post_block < pre_block:
            raise SystemExit(f"Block height reduced for {key}")
PY

python3 - "$SNAPSHOT_DIR/chain-data-map.json" "$SNAPSHOT_DIR/chain-data-fingerprints-post.json" <<'PY'
import hashlib, json, os, sys

map_path=sys.argv[1]
out_path=sys.argv[2]

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

json.dump({"fingerprints":fingerprints},open(out_path,"w"),indent=2)
PY

python3 - "$SNAPSHOT_DIR/chain-data-fingerprints.json" "$SNAPSHOT_DIR/chain-data-fingerprints-post.json" <<'PY'
import json,sys

pre=json.load(open(sys.argv[1]))
post=json.load(open(sys.argv[2]))
if pre.get("fingerprints")!=post.get("fingerprints"):
    raise SystemExit("Chain data fingerprint mismatch")
PY

attestation_json="$ATTEST_DIR/immutability-attestation.json"
python3 - "$SNAPSHOT_DIR" "$attestation_json" <<'PY'
import hashlib,json,os,sys

snap=sys.argv[1]
attest=sys.argv[2]

def sha256(path):
    h=hashlib.sha256()
    with open(path,"rb") as f:
        h.update(f.read())
    return h.hexdigest()

payload={
  "timestamp": os.path.basename(snap),
  "mode": os.getenv("MODE","dev"),
  "chainFingerprints": sha256(os.path.join(snap,"chain-data-fingerprints.json")),
  "chainFingerprintsPost": sha256(os.path.join(snap,"chain-data-fingerprints-post.json")),
  "composeConfig": sha256(os.path.join(snap,"compose-files.txt")),
  "gasToken": sha256(os.path.join(snap,"gas-token.json")),
  "containersPre": sha256(os.path.join(snap,"inspect","docker-ps.json")),
  "containersPost": sha256(os.path.join(snap,"chain-status-post.json")),
  "verdict": "IMMUTABLE"
}
json.dump(payload,open(attest,"w"),indent=2)
PY

sign() {
  local attest_file="$1"
  local sig_file="$2"
  local pub_file="$3"

  if [[ -n "${GHOST_ATTEST_GPG_KEY:-}" ]]; then
    gpg --batch --yes --local-user "$GHOST_ATTEST_GPG_KEY" --output "$sig_file" --detach-sign "$attest_file"
    gpg --armor --export "$GHOST_ATTEST_GPG_KEY" > "$pub_file"
    return 0
  fi

  if [[ -n "${GHOST_ATTEST_PRIVATE_KEY:-}" ]]; then
    openssl dgst -sha256 -sign "$GHOST_ATTEST_PRIVATE_KEY" -out "$sig_file" "$attest_file"
    if [[ -n "${GHOST_ATTEST_PUBLIC_KEY:-}" ]]; then
      cp "$GHOST_ATTEST_PUBLIC_KEY" "$pub_file"
    else
      openssl pkey -in "$GHOST_ATTEST_PRIVATE_KEY" -pubout -out "$pub_file"
    fi
    return 0
  fi

  return 1
}

if ! sign "$attestation_json" "$ATTEST_DIR/immutability-attestation.sig" "$ATTEST_DIR/immutability-attestation.pub"; then
  abort "Signing failed. Provide GHOST_ATTEST_GPG_KEY or GHOST_ATTEST_PRIVATE_KEY."
fi

log "Recreate complete. Attestation written to $ATTEST_DIR"
