#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export ROOT_DIR
MODE="dev"
ROLLING="false"
DRY_RUN="false"
YES="false"
NO_ROLLBACK="false"
ROLLBACK_ARMED="false"
SIGNING_METHOD=""
ANOMALY_DIR="$ROOT_DIR/ops/ai/anomaly"

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

rollback_on_error() {
  if [[ "$ROLLBACK_ARMED" == "true" && "$NO_ROLLBACK" != "true" ]]; then
    log "Failure detected. Initiating rollback from snapshot $SNAPSHOT_DIR"
    bash "$ROOT_DIR/ops/docker/ghostctl-rollback.sh" "$SNAPSHOT_DIR" || true
  fi
}
trap rollback_on_error ERR

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

export MODE

if ! docker info >/dev/null 2>&1; then
  abort "Docker daemon is not running."
fi

if command -v tpm2_createprimary >/dev/null 2>&1 && command -v tpm2_getcap >/dev/null 2>&1; then
  if tpm2_getcap properties-fixed >/dev/null 2>&1; then
    SIGNING_METHOD="tpm"
  fi
fi

if [[ -z "$SIGNING_METHOD" && -n "${GHOST_ATTEST_GPG_KEY:-}" ]]; then
  SIGNING_METHOD="gpg"
fi

if [[ -z "$SIGNING_METHOD" && -n "${GHOST_ATTEST_PRIVATE_KEY:-}" ]]; then
  SIGNING_METHOD="openssl"
fi

if [[ -z "$SIGNING_METHOD" ]]; then
  abort "Signing key not provided. Set GHOST_ATTEST_GPG_KEY or GHOST_ATTEST_PRIVATE_KEY."
fi
export SIGNING_METHOD

TIMESTAMP="$(date -u +%Y%m%d-%H%M%S)"
SNAPSHOT_DIR="$ROOT_DIR/ops/docker/snapshots/$TIMESTAMP"
ATTEST_DIR="$ROOT_DIR/ops/docker/attestations"
export ATTEST_DIR
DID_METHOD="${GHOST_DID_METHOD:-key}"
DID_KEY_PATH="${GHOST_DID_KEY_PATH:-$ATTEST_DIR/did-ed25519.pem}"
DID_PUB_PATH="${GHOST_DID_PUB_PATH:-$ATTEST_DIR/did-ed25519.pub.pem}"
DID_DOC_PATH="$ATTEST_DIR/did-key.json"
DID_VC_PATH="$ATTEST_DIR/immutability-vc.json"
mkdir -p "$ANOMALY_DIR"
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

python3 - "$SNAPSHOT_DIR/rendered-compose.sha256" "${rendered_configs[@]}" <<'PY'
import hashlib,sys

out_path=sys.argv[1]
configs=sys.argv[2:]
h=hashlib.sha256()
for path in configs:
    with open(path,"rb") as f:
        h.update(f.read())
with open(out_path,"w") as out:
    out.write(h.hexdigest())
PY

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

python3 - "$CHAIN_CONFIG_PATH" "$SNAPSHOT_DIR/chain-state-merkle-proofs.json" <<'PY'
import json,sys,urllib.request

chain_path=sys.argv[1]
out_path=sys.argv[2]

chains=json.load(open(chain_path)).get("chains",[])

def rpc_call(url, method, params=None):
    payload={"jsonrpc":"2.0","id":1,"method":method,"params":params or []}
    data=json.dumps(payload).encode()
    req=urllib.request.Request(url,data=data,headers={"Content-Type":"application/json"})
    with urllib.request.urlopen(req,timeout=8) as resp:
        return json.load(resp)

proofs=[]
for chain in chains:
    url=chain.get("rpcUrl") or chain.get("rpc")
    entry={"chainId":chain.get("chainId"),"chainKey":chain.get("key"),"rpcUrl":url}
    if not url:
        entry["error"]="missing_rpc"
        proofs.append(entry)
        continue
    try:
        latest = rpc_call(url,"eth_getBlockByNumber",["latest", False]).get("result")
        if not latest:
            entry["error"]="missing_block"
            proofs.append(entry)
            continue
        block_number = latest.get("number")
        entry["blockNumber"]=block_number
        entry["blockHash"]=latest.get("hash")
        entry["stateRoot"]=latest.get("stateRoot")
        entry["receiptsRoot"]=latest.get("receiptsRoot")
        proof = rpc_call(url,"eth_getProof",["0x0000000000000000000000000000000000000000",[],block_number]).get("result")
        entry["accountProof"]=proof.get("accountProof") if isinstance(proof,dict) else None
    except Exception as exc:
        entry["error"]=str(exc)
    proofs.append(entry)

json.dump({"proofs":proofs},open(out_path,"w"),indent=2)
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

mapfile -t chain_service_lines < <(python3 - "$SNAPSHOT_DIR/chain-data-map.json" <<'PY'
import json,sys

payload=json.load(open(sys.argv[1]))
entries=payload.get("entries",[])
services={}
for entry in entries:
    if not entry.get("chainCandidate"):
        continue
    labels=entry.get("labels",{}) or {}
    ha=str(labels.get("com.ghostchain.ha","false")).lower()=="true"
    services[entry.get("service")]=ha

for name,ha in services.items():
    print(f\"{name}|{str(ha).lower()}\")
PY
)

declare -A chain_service_ha
for line in "${chain_service_lines[@]}"; do
  svc="${line%%|*}"
  ha="${line##*|}"
  chain_service_ha["$svc"]="$ha"
done

python3 - "$SNAPSHOT_DIR/chain-data-map.json" "$SNAPSHOT_DIR/chain-data-fingerprints.json" <<'PY'
import hashlib, json, os, sys

map_path=sys.argv[1]
out_path=sys.argv[2]

exclude_suffixes=(".ipc", ".lock", ".log", ".tmp")
exclude_names=("LOCK", "lock")

payload=json.load(open(map_path))
entries=[e for e in payload.get("entries",[]) if e.get("chainCandidate")]

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

python3 - "$SNAPSHOT_DIR/oci-image-provenance-pre.json" "${rendered_configs[@]}" <<'PY'
import hashlib,json,os,subprocess,sys

out_path=sys.argv[1]
configs=sys.argv[2:]

def sha256(path):
    h=hashlib.sha256()
    with open(path,"rb") as f:
        h.update(f.read())
    return h.hexdigest()

def image_info(image):
    try:
        data=json.loads(subprocess.check_output(["docker","image","inspect",image],text=True))
    except Exception:
        return None
    if not data:
        return None
    info=data[0]
    return {
        "imageId": info.get("Id"),
        "repoDigests": info.get("RepoDigests"),
        "platform": f\"{info.get('Os','')}/{info.get('Architecture','')}\".strip('/'),
    }

def dockerfile_bases(path):
    bases=[]
    try:
        with open(path,"r",encoding="utf-8") as f:
            for line in f:
                line=line.strip()
                if not line.lower().startswith("from "):
                    continue
                base=line.split()[1]
                bases.append(base)
    except Exception:
        return bases
    return bases

records=[]
for cfg in configs:
    payload=json.load(open(cfg))
    services=payload.get("services",{})
    cfg_dir=os.path.dirname(cfg)
    for name,svc in services.items():
        image=svc.get("image")
        build=svc.get("build")
        dockerfile=None
        build_args=None
        context=None
        if isinstance(build,dict):
            context=build.get("context")
            dockerfile=build.get("dockerfile") or "Dockerfile"
            build_args=build.get("args")
        elif isinstance(build,str):
            context=build
            dockerfile="Dockerfile"
        if context and not os.path.isabs(context):
            context=os.path.normpath(os.path.join(cfg_dir,context))
        dockerfile_path=None
        if context and dockerfile:
            dockerfile_path=os.path.join(context,dockerfile)
        dockerfile_checksum=sha256(dockerfile_path) if dockerfile_path and os.path.isfile(dockerfile_path) else None
        base_images=dockerfile_bases(dockerfile_path) if dockerfile_path else []
        base_digests=[]
        for base in base_images:
            info=image_info(base)
            base_digests.append({
                "base": base,
                "repoDigests": info.get("repoDigests") if info else None
            })
        img_info=image_info(image) if image else None
        records.append({
            "service": name,
            "composeFile": cfg,
            "image": image,
            "imageId": img_info.get("imageId") if img_info else None,
            "repoDigests": img_info.get("repoDigests") if img_info else None,
            "platform": img_info.get("platform") if img_info else None,
            "buildContext": context,
            "dockerfile": dockerfile_path,
            "dockerfileChecksum": dockerfile_checksum,
            "buildArgs": build_args,
            "baseImages": base_digests
        })

json.dump({"images":records},open(out_path,"w"),indent=2)
PY

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
    chain_batch=()
    for svc in "${services[@]}"; do
      if [[ -n "${chain_service_ha[$svc]+x}" && "${chain_service_ha[$svc]}" != "true" ]]; then
        chain_batch+=("$svc")
        continue
      fi
      log "Recreating $svc via $file"
      docker compose --project-directory "$dir" -f "$file" up -d --no-deps --force-recreate "$svc"
    done
    if [[ ${#chain_batch[@]} -gt 0 ]]; then
      log "Recreating chain services in non-rolling batch: ${chain_batch[*]}"
      docker compose --project-directory "$dir" -f "$file" up -d --force-recreate "${chain_batch[@]}"
    fi
  else
    log "Recreating services via $file"
    docker compose --project-directory "$dir" -f "$file" up -d --force-recreate
  fi
}

ROLLBACK_ARMED="true"
for file in "${compose_files[@]}"; do
  recreate_compose_file "$file"
done

docker ps -a --format '{{json .}}' > "$SNAPSHOT_DIR/inspect/docker-ps-post.json"

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

python3 - "$CHAIN_CONFIG_PATH" "$SNAPSHOT_DIR/chain-state-merkle-proofs.json" "$SNAPSHOT_DIR/chain-state-merkle-proofs-post.json" <<'PY'
import json,sys,urllib.request

chain_path=sys.argv[1]
pre_path=sys.argv[2]
out_path=sys.argv[3]

chains=json.load(open(chain_path)).get("chains",[])
pre=json.load(open(pre_path)).get("proofs",[])
pre_map={p.get("chainKey"):p for p in pre}

def rpc_call(url, method, params=None):
    payload={"jsonrpc":"2.0","id":1,"method":method,"params":params or []}
    data=json.dumps(payload).encode()
    req=urllib.request.Request(url,data=data,headers={"Content-Type":"application/json"})
    with urllib.request.urlopen(req,timeout=8) as resp:
        return json.load(resp)

proofs=[]
for chain in chains:
    url=chain.get("rpcUrl") or chain.get("rpc")
    entry={"chainId":chain.get("chainId"),"chainKey":chain.get("key"),"rpcUrl":url}
    if not url:
        entry["error"]="missing_rpc"
        proofs.append(entry)
        continue
    try:
        target_block = None
        pre_entry = pre_map.get(chain.get("key"))
        if pre_entry and pre_entry.get("blockNumber"):
            target_block = pre_entry.get("blockNumber")
        else:
            latest = rpc_call(url,"eth_getBlockByNumber",["latest", False]).get("result")
            target_block = latest.get("number") if latest else None
        if not target_block:
            entry["error"]="missing_block"
            proofs.append(entry)
            continue
        block = rpc_call(url,"eth_getBlockByNumber",[target_block, False]).get("result")
        if not block:
            entry["error"]="block_not_found"
            proofs.append(entry)
            continue
        entry["blockNumber"]=target_block
        entry["blockHash"]=block.get("hash")
        entry["stateRoot"]=block.get("stateRoot")
        entry["receiptsRoot"]=block.get("receiptsRoot")
        proof = rpc_call(url,"eth_getProof",["0x0000000000000000000000000000000000000000",[],target_block]).get("result")
        entry["accountProof"]=proof.get("accountProof") if isinstance(proof,dict) else None
    except Exception as exc:
        entry["error"]=str(exc)
    proofs.append(entry)

json.dump({"proofs":proofs},open(out_path,"w"),indent=2)
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

python3 - "$SNAPSHOT_DIR/chain-state-merkle-proofs.json" "$SNAPSHOT_DIR/chain-state-merkle-proofs-post.json" <<'PY'
import json,sys

pre=json.load(open(sys.argv[1]))
post=json.load(open(sys.argv[2]))

pre_map={p.get("chainKey"):p for p in pre.get("proofs",[])}
post_map={p.get("chainKey"):p for p in post.get("proofs",[])}

for key,pre_entry in pre_map.items():
    post_entry=post_map.get(key)
    if not post_entry:
        raise SystemExit(f"Missing post proof for {key}")
    if pre_entry.get("blockHash") and post_entry.get("blockHash") and pre_entry["blockHash"]!=post_entry["blockHash"]:
        raise SystemExit(f"Block hash changed for {key}")
    if pre_entry.get("stateRoot") and post_entry.get("stateRoot") and pre_entry["stateRoot"]!=post_entry["stateRoot"]:
        raise SystemExit(f"State root changed for {key}")
    if pre_entry.get("receiptsRoot") and post_entry.get("receiptsRoot") and pre_entry["receiptsRoot"]!=post_entry["receiptsRoot"]:
        raise SystemExit(f"Receipts root changed for {key}")
PY

cp "$SNAPSHOT_DIR/chain-state-merkle-proofs.json" "$ATTEST_DIR/chain-state-merkle-proofs.json"
cp "$SNAPSHOT_DIR/chain-state-merkle-proofs-post.json" "$ATTEST_DIR/chain-state-merkle-proofs-post.json"

python3 - "$SNAPSHOT_DIR/chain-data-map.json" "$SNAPSHOT_DIR/chain-data-fingerprints-post.json" <<'PY'
import hashlib, json, os, sys

map_path=sys.argv[1]
out_path=sys.argv[2]

exclude_suffixes=(".ipc", ".lock", ".log", ".tmp")
exclude_names=("LOCK", "lock")

payload=json.load(open(map_path))
entries=[e for e in payload.get("entries",[]) if e.get("chainCandidate")]

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

python3 - "$SNAPSHOT_DIR" "$ANOMALY_DIR/anomaly-report.json" "$ANOMALY_DIR/model-metadata.json" <<'PY'
import json,sys,datetime

snap=sys.argv[1]
report_path=sys.argv[2]
model_path=sys.argv[3]

def load(path):
    return json.load(open(path))

pre_status=load(f"{snap}/chain-status-pre.json")
post_status=load(f"{snap}/chain-status-post.json")
pre_proofs=load(f"{snap}/chain-state-merkle-proofs.json")
post_proofs=load(f"{snap}/chain-state-merkle-proofs-post.json")

def map_by_key(items):
    return {item.get("chainKey"): item for item in items}

pre_status_map=map_by_key(pre_status.get("chains",[]))
post_status_map=map_by_key(post_status.get("chains",[]))
pre_proof_map=map_by_key(pre_proofs.get("proofs",[]))
post_proof_map=map_by_key(post_proofs.get("proofs",[]))

findings=[]
severity="INFO"

def bump(level):
    nonlocal severity
    order=["INFO","WARN","CRITICAL"]
    if order.index(level) > order.index(severity):
        severity=level

for key,pre_entry in pre_status_map.items():
    post_entry=post_status_map.get(key, {})
    if pre_entry.get("error") or post_entry.get("error"):
        findings.append({"chainKey": key, "issue": "rpc_error", "severity": "WARN"})
        bump("WARN")
    if pre_entry.get("rpcChainId") != post_entry.get("rpcChainId"):
        findings.append({"chainKey": key, "issue": "chain_id_changed", "severity": "CRITICAL"})
        bump("CRITICAL")
    try:
        pre_block=int(pre_entry.get("blockNumber","0"),16)
        post_block=int(post_entry.get("blockNumber","0"),16)
        if post_block < pre_block:
            findings.append({"chainKey": key, "issue": "block_height_decrease", "severity": "CRITICAL"})
            bump("CRITICAL")
    except Exception:
        pass

for key,pre_entry in pre_proof_map.items():
    post_entry=post_proof_map.get(key, {})
    if pre_entry.get("stateRoot") != post_entry.get("stateRoot"):
        findings.append({"chainKey": key, "issue": "state_root_changed", "severity": "CRITICAL"})
        bump("CRITICAL")
    if pre_entry.get("receiptsRoot") != post_entry.get("receiptsRoot"):
        findings.append({"chainKey": key, "issue": "receipts_root_changed", "severity": "CRITICAL"})
        bump("CRITICAL")
    if pre_entry.get("blockHash") != post_entry.get("blockHash"):
        findings.append({"chainKey": key, "issue": "block_hash_changed", "severity": "CRITICAL"})
        bump("CRITICAL")

report={
  "timestamp": datetime.datetime.utcnow().isoformat()+"Z",
  "severity": severity,
  "findings": findings,
  "summary": "Deterministic anomaly scan based on pre/post snapshots."
}

model_meta={
  "model": "deterministic-rule-set",
  "version": "1.0.0",
  "features": [
    "chainId",
    "blockNumber",
    "blockHash",
    "stateRoot",
    "receiptsRoot",
    "rpcError"
  ],
  "trainingData": "none"
}

json.dump(report,open(report_path,"w"),indent=2)
json.dump(model_meta,open(model_path,"w"),indent=2)
PY

cp "$ANOMALY_DIR/anomaly-report.json" "$SNAPSHOT_DIR/anomaly-report.json"
cp "$ANOMALY_DIR/model-metadata.json" "$SNAPSHOT_DIR/model-metadata.json"

ANOMALY_SEVERITY=$(python3 - "$ANOMALY_DIR/anomaly-report.json" <<'PY'
import json,sys
data=json.load(open(sys.argv[1]))
print(data.get("severity","INFO"))
PY
)

if [[ "$ANOMALY_SEVERITY" == "CRITICAL" ]]; then
  log "AI anomaly severity CRITICAL - activating kill switch."
  "$ROOT_DIR/ops/security/kill-switch/activate.sh" --snapshot "$SNAPSHOT_DIR" --mode "$MODE" --reason "ai_anomaly_critical" || true
  abort "AI anomaly detection flagged CRITICAL severity."
fi

python3 - "$SNAPSHOT_DIR/oci-image-provenance-post.json" "${rendered_configs[@]}" <<'PY'
import hashlib,json,os,subprocess,sys

out_path=sys.argv[1]
configs=sys.argv[2:]

def sha256(path):
    h=hashlib.sha256()
    with open(path,"rb") as f:
        h.update(f.read())
    return h.hexdigest()

def image_info(image):
    try:
        data=json.loads(subprocess.check_output(["docker","image","inspect",image],text=True))
    except Exception:
        return None
    if not data:
        return None
    info=data[0]
    return {
        "imageId": info.get("Id"),
        "repoDigests": info.get("RepoDigests"),
        "platform": f\"{info.get('Os','')}/{info.get('Architecture','')}\".strip('/'),
    }

def dockerfile_bases(path):
    bases=[]
    try:
        with open(path,"r",encoding="utf-8") as f:
            for line in f:
                line=line.strip()
                if not line.lower().startswith("from "):
                    continue
                base=line.split()[1]
                bases.append(base)
    except Exception:
        return bases
    return bases

records=[]
for cfg in configs:
    payload=json.load(open(cfg))
    services=payload.get("services",{})
    cfg_dir=os.path.dirname(cfg)
    for name,svc in services.items():
        image=svc.get("image")
        build=svc.get("build")
        dockerfile=None
        build_args=None
        context=None
        if isinstance(build,dict):
            context=build.get("context")
            dockerfile=build.get("dockerfile") or "Dockerfile"
            build_args=build.get("args")
        elif isinstance(build,str):
            context=build
            dockerfile="Dockerfile"
        if context and not os.path.isabs(context):
            context=os.path.normpath(os.path.join(cfg_dir,context))
        dockerfile_path=None
        if context and dockerfile:
            dockerfile_path=os.path.join(context,dockerfile)
        dockerfile_checksum=sha256(dockerfile_path) if dockerfile_path and os.path.isfile(dockerfile_path) else None
        base_images=dockerfile_bases(dockerfile_path) if dockerfile_path else []
        base_digests=[]
        for base in base_images:
            info=image_info(base)
            base_digests.append({
                "base": base,
                "repoDigests": info.get("repoDigests") if info else None
            })
        img_info=image_info(image) if image else None
        records.append({
            "service": name,
            "composeFile": cfg,
            "image": image,
            "imageId": img_info.get("imageId") if img_info else None,
            "repoDigests": img_info.get("repoDigests") if img_info else None,
            "platform": img_info.get("platform") if img_info else None,
            "buildContext": context,
            "dockerfile": dockerfile_path,
            "dockerfileChecksum": dockerfile_checksum,
            "buildArgs": build_args,
            "baseImages": base_digests
        })

json.dump({"images":records},open(out_path,"w"),indent=2)
PY

python3 - "$SNAPSHOT_DIR/oci-image-provenance-pre.json" "$SNAPSHOT_DIR/oci-image-provenance-post.json" <<'PY'
import json,sys

pre=json.load(open(sys.argv[1]))
post=json.load(open(sys.argv[2]))

pre_map={item.get("service"):item for item in pre.get("images",[])}
post_map={item.get("service"):item for item in post.get("images",[])}

for service,pre_item in pre_map.items():
    post_item=post_map.get(service)
    if not post_item:
        raise SystemExit(f"Missing post image record for {service}")
    pre_digest=(pre_item.get("repoDigests") or [None])[0]
    post_digest=(post_item.get("repoDigests") or [None])[0]
    if pre_digest and post_digest and pre_digest != post_digest:
        raise SystemExit(f"Image digest changed for {service}")
PY

python3 - "$SNAPSHOT_DIR" "$SNAPSHOT_DIR/oci-image-provenance-pre.json" "$SNAPSHOT_DIR/oci-image-provenance-post.json" "$ATTEST_DIR/oci-image-provenance.json" <<'PY'
import json,sys,os

snap=sys.argv[1]
pre=json.load(open(sys.argv[2]))
post=json.load(open(sys.argv[3]))
out_path=sys.argv[4]

def read_lines(path):
    items=[]
    if not os.path.isfile(path):
        return items
    with open(path) as f:
        for line in f:
            line=line.strip()
            if not line:
                continue
            try:
                items.append(json.loads(line))
            except Exception:
                continue
    return items

payload={
  "pre": pre,
  "post": post,
  "containersPre": read_lines(os.path.join(snap,"inspect","docker-ps.json")),
  "containersPost": read_lines(os.path.join(snap,"inspect","docker-ps-post.json"))
}

json.dump(payload,open(out_path,"w"),indent=2)
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
  "signingMethod": os.getenv("SIGNING_METHOD","unknown"),
  "chainFingerprints": sha256(os.path.join(snap,"chain-data-fingerprints.json")),
  "chainFingerprintsPost": sha256(os.path.join(snap,"chain-data-fingerprints-post.json")),
  "composeFiles": sha256(os.path.join(snap,"compose-files.txt")),
  "renderedCompose": sha256(os.path.join(snap,"rendered-compose.sha256")),
  "gasToken": sha256(os.path.join(snap,"gas-token.json")),
  "chainStateProofs": sha256(os.path.join(snap,"chain-state-merkle-proofs.json")),
  "chainStateProofsPost": sha256(os.path.join(snap,"chain-state-merkle-proofs-post.json")),
  "ociImageProvenancePre": sha256(os.path.join(snap,"oci-image-provenance-pre.json")),
  "ociImageProvenancePost": sha256(os.path.join(snap,"oci-image-provenance-post.json")),
  "ociImageProvenance": sha256(os.path.join(os.getenv("ATTEST_DIR","."),"oci-image-provenance.json")),
  "anomalyReport": sha256(os.path.join(snap,"anomaly-report.json")),
  "anomalyModel": sha256(os.path.join(snap,"model-metadata.json")),
  "recreateScript": sha256(os.path.join(os.getenv("ROOT_DIR","."),"ops","docker","ghostctl-recreate.sh")),
  "containersPre": sha256(os.path.join(snap,"inspect","docker-ps.json")),
  "containersPost": sha256(os.path.join(snap,"inspect","docker-ps-post.json")),
  "verdict": "IMMUTABLE"
}
json.dump(payload,open(attest,"w"),indent=2)
PY

sign() {
  local attest_file="$1"
  local sig_file="$2"
  local pub_file="$3"

  if [[ "$SIGNING_METHOD" == "tpm" ]]; then
    local tpm_dir
    tpm_dir=$(mktemp -d)
    tpm2_createprimary -Q -C o -g sha256 -G ecc -c "$tpm_dir/primary.ctx"
    tpm2_create -Q -C "$tpm_dir/primary.ctx" -g sha256 -G ecc -u "$tpm_dir/key.pub" -r "$tpm_dir/key.priv"
    tpm2_load -Q -C "$tpm_dir/primary.ctx" -u "$tpm_dir/key.pub" -r "$tpm_dir/key.priv" -c "$tpm_dir/key.ctx"
    tpm2_sign -Q -c "$tpm_dir/key.ctx" -g sha256 -o "$sig_file" "$attest_file"
    tpm2_readpublic -c "$tpm_dir/key.ctx" -f pem -o "$pub_file"
    rm -rf "$tpm_dir"
    return 0
  fi

  if [[ "$SIGNING_METHOD" == "gpg" && -n "${GHOST_ATTEST_GPG_KEY:-}" ]]; then
    gpg --batch --yes --local-user "$GHOST_ATTEST_GPG_KEY" --output "$sig_file" --detach-sign "$attest_file"
    gpg --armor --export "$GHOST_ATTEST_GPG_KEY" > "$pub_file"
    return 0
  fi

  if [[ "$SIGNING_METHOD" == "openssl" && -n "${GHOST_ATTEST_PRIVATE_KEY:-}" ]]; then
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

sig_file="$ATTEST_DIR/immutability-attestation.sig"
pub_file="$ATTEST_DIR/immutability-attestation.pub"
if [[ "$SIGNING_METHOD" == "tpm" ]]; then
  sig_file="$ATTEST_DIR/immutability-attestation.tpm.sig"
  pub_file="$ATTEST_DIR/tpm-public-key.pem"
fi

if ! sign "$attestation_json" "$sig_file" "$pub_file"; then
  abort "Signing failed. Provide GHOST_ATTEST_GPG_KEY or GHOST_ATTEST_PRIVATE_KEY."
fi

if ! command -v openssl >/dev/null 2>&1; then
  abort "openssl is required for DID VC generation."
fi

generate_did() {
  local method="$1"
  if [[ "$method" != "key" && "$method" != "web" ]]; then
    abort "Unsupported DID method: $method (expected key or web)"
  fi
  if [[ "$method" == "web" ]]; then
    if [[ -z "${GHOST_DID:-}" ]]; then
      abort "GHOST_DID is required for did:web"
    fi
    if [[ -z "${GHOST_DID_VERIFICATION_METHOD:-}" ]]; then
      abort "GHOST_DID_VERIFICATION_METHOD is required for did:web"
    fi
    if [[ -z "${GHOST_DID_KEY_PATH:-}" ]]; then
      abort "GHOST_DID_KEY_PATH is required for did:web"
    fi
    DID_KEY_PATH="$GHOST_DID_KEY_PATH"
    if [[ -z "${GHOST_DID_PUB_PATH:-}" ]]; then
      DID_PUB_PATH="$ATTEST_DIR/did-web.pub.pem"
    else
      DID_PUB_PATH="$GHOST_DID_PUB_PATH"
    fi
    openssl pkey -in "$DID_KEY_PATH" -pubout -out "$DID_PUB_PATH"
    python3 - "$DID_DOC_PATH" "$GHOST_DID" "$GHOST_DID_VERIFICATION_METHOD" "$DID_PUB_PATH" <<'PY'
import json,sys
doc_path=sys.argv[1]
did=sys.argv[2]
vm=sys.argv[3]
pub_path=sys.argv[4]
pub_pem=open(pub_path).read()
json.dump({
  "did": did,
  "verificationMethod": vm,
  "publicKeyPem": pub_pem,
  "method": "web"
},open(doc_path,"w"),indent=2)
PY
    return 0
  fi

  if [[ ! -f "$DID_KEY_PATH" ]]; then
    openssl genpkey -algorithm Ed25519 -out "$DID_KEY_PATH"
  fi
  openssl pkey -in "$DID_KEY_PATH" -pubout -out "$DID_PUB_PATH"
  local der_path="$ATTEST_DIR/did-ed25519.pub.der"
  openssl pkey -in "$DID_KEY_PATH" -pubout -outform DER -out "$der_path"
  python3 - "$der_path" "$DID_DOC_PATH" <<'PY'
import json,sys

data=open(sys.argv[1],"rb").read()

def read_len(buf, idx):
    length=buf[idx]
    idx+=1
    if length & 0x80:
        n=length & 0x7f
        length=int.from_bytes(buf[idx:idx+n],"big")
        idx+=n
    return length, idx

def read_tlv(buf, idx):
    tag=buf[idx]
    idx+=1
    length, idx=read_len(buf, idx)
    val=buf[idx:idx+length]
    idx+=length
    return tag, val, idx

tag, seq_val, idx = read_tlv(data, 0)
pub=None
i=0
while i < len(seq_val):
    t, v, i = read_tlv(seq_val, i)
    if t == 0x03:
        if len(v) >= 2:
            pub = v[1:]
        break

if pub is None:
    raise SystemExit("Failed to extract Ed25519 public key bytes")

prefix=bytes([0xed,0x01]) + pub
alphabet=b'123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
num=int.from_bytes(prefix,"big")
enc=b""
while num > 0:
    num, rem = divmod(num, 58)
    enc = alphabet[rem:rem+1] + enc
zeros=len(prefix) - len(prefix.lstrip(b"\0"))
enc = b"1" * zeros + enc
mb = b"z" + enc
did="did:key:" + mb.decode()
vm=did + "#" + mb.decode()

json.dump({
  "did": did,
  "verificationMethod": vm,
  "publicKeyMultibase": mb.decode(),
  "publicKeyHex": pub.hex(),
  "keyType": "Ed25519",
  "method": "key"
},open(sys.argv[2],"w"),indent=2)
PY
}

generate_did "$DID_METHOD"

DID_ID=$(python3 - "$DID_DOC_PATH" <<'PY'
import json,sys
data=json.load(open(sys.argv[1]))
print(data.get("did",""))
PY
)

DID_VERIFICATION_METHOD=$(python3 - "$DID_DOC_PATH" <<'PY'
import json,sys
data=json.load(open(sys.argv[1]))
print(data.get("verificationMethod",""))
PY
)

if [[ -z "$DID_ID" || -z "$DID_VERIFICATION_METHOD" ]]; then
  abort "Failed to resolve DID values for VC signing."
fi

VC_PAYLOAD_PATH="$ATTEST_DIR/immutability-vc.payload.json"
VC_SIG_PATH="$ATTEST_DIR/immutability-vc.sig"

python3 - "$attestation_json" "$CHAIN_CONFIG_PATH" "$SNAPSHOT_DIR/gas-token.json" "$DID_ID" "$VC_PAYLOAD_PATH" <<'PY'
import datetime,hashlib,json,sys

attest=sys.argv[1]
chain_path=sys.argv[2]
gas_path=sys.argv[3]
did=sys.argv[4]
payload_path=sys.argv[5]

def sha256(path):
    h=hashlib.sha256()
    with open(path,"rb") as f:
        h.update(f.read())
    return h.hexdigest()

chains=json.load(open(chain_path)).get("chains",[])
chain_ids=[c.get("chainId") for c in chains if c.get("chainId") is not None]
gas=json.load(open(gas_path)).get("address")

attest_hash=sha256(attest)
payload={
  "@context": [
    "https://www.w3.org/2018/credentials/v1"
  ],
  "type": [
    "VerifiableCredential",
    "GhostChainImmutabilityAttestation"
  ],
  "issuer": did,
  "issuanceDate": datetime.datetime.utcnow().isoformat()+"Z",
  "credentialSubject": {
    "id": did,
    "attestationHash": attest_hash,
    "gasTokenAddress": gas,
    "chainIds": chain_ids
  },
  "id": "urn:sha256:"+attest_hash
}

with open(payload_path,"w") as out:
    out.write(json.dumps(payload,sort_keys=True,separators=(",",":")))
PY

if ! openssl pkeyutl -sign -inkey "$DID_KEY_PATH" -rawin -in "$VC_PAYLOAD_PATH" -out "$VC_SIG_PATH"; then
  abort "Failed to sign DID VC payload."
fi

if ! openssl pkeyutl -verify -pubin -inkey "$DID_PUB_PATH" -rawin -in "$VC_PAYLOAD_PATH" -sigfile "$VC_SIG_PATH"; then
  abort "Failed to verify DID VC signature."
fi

python3 - "$VC_PAYLOAD_PATH" "$VC_SIG_PATH" "$DID_VERIFICATION_METHOD" "$DID_VC_PATH" <<'PY'
import base64,json,sys,datetime

payload=json.load(open(sys.argv[1]))
sig=open(sys.argv[2],"rb").read()
vm=sys.argv[3]
out_path=sys.argv[4]

jws=base64.urlsafe_b64encode(sig).decode().rstrip("=")
proof={
  "type": "Ed25519Signature2020",
  "created": datetime.datetime.utcnow().isoformat()+"Z",
  "proofPurpose": "assertionMethod",
  "verificationMethod": vm,
  "jws": jws
}
payload["proof"]=proof

json.dump(payload,open(out_path,"w"),indent=2)
PY

log "Recreate complete. Attestation written to $ATTEST_DIR"
