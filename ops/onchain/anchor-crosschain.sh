#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ATTEST=""
RECURSIVE=""
OUT_PATH=""
RPC_L1=""
RPC_L2=""
RPC_L3=""
RAW_L1="${GHOST_ANCHOR_L1_RAW_TX:-}"
RAW_L2="${GHOST_ANCHOR_L2_RAW_TX:-}"
RAW_L3="${GHOST_ANCHOR_L3_RAW_TX:-}"

usage() {
  cat <<'USAGE'
Usage: anchor-crosschain.sh --attestation <path> --recursive <path> --out <path> [--rpc-l1 <url>] [--rpc-l2 <url>] [--rpc-l3 <url>]
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --attestation) ATTEST="$2"; shift 2;;
    --recursive) RECURSIVE="$2"; shift 2;;
    --out) OUT_PATH="$2"; shift 2;;
    --rpc-l1) RPC_L1="$2"; shift 2;;
    --rpc-l2) RPC_L2="$2"; shift 2;;
    --rpc-l3) RPC_L3="$2"; shift 2;;
    -h|--help) usage; exit 0;;
    *) echo "Unknown argument: $1" >&2; exit 1;;
  esac
done

if [[ -z "$ATTEST" || -z "$RECURSIVE" || -z "$OUT_PATH" ]]; then
  echo "Missing required arguments." >&2
  exit 1
fi

CHAIN_CONFIG_PATH="${GHOST_CHAIN_CONFIG_PATH:-$ROOT_DIR/services/ghost-pil/config/chains.json}"
if [[ ! -f "$CHAIN_CONFIG_PATH" ]]; then
  CHAIN_CONFIG_PATH="$ROOT_DIR/services/ghost-gas-engine/config/chains.json"
fi

python3 - "$ATTEST" "$RECURSIVE" "$OUT_PATH" "$CHAIN_CONFIG_PATH" "$RPC_L1" "$RPC_L2" "$RPC_L3" "$RAW_L1" "$RAW_L2" "$RAW_L3" <<'PY'
import hashlib,json,sys,urllib.request,datetime,os

attest_path=sys.argv[1]
recursive_path=sys.argv[2]
out_path=sys.argv[3]
chain_config=sys.argv[4]
rpc_l1=sys.argv[5] or ""
rpc_l2=sys.argv[6] or ""
rpc_l3=sys.argv[7] or ""
raw_l1=sys.argv[8] or ""
raw_l2=sys.argv[9] or ""
raw_l3=sys.argv[10] or ""

def sha256(path):
    h=hashlib.sha256()
    with open(path,"rb") as f:
        h.update(f.read())
    return h.hexdigest()

attest_hash=sha256(attest_path)
recursive_hash=sha256(recursive_path)
bundle_hash=hashlib.sha256((attest_hash+recursive_hash).encode()).hexdigest()
timestamp=datetime.datetime.utcnow().isoformat()+"Z"

chains=[]
if os.path.isfile(chain_config):
    data=json.load(open(chain_config)).get("chains",[])
    for c in data:
        ctype=(c.get("chainType") or c.get("layer") or "").upper()
        name=(c.get("chainName") or c.get("name") or "").lower()
        key=c.get("key") or c.get("name") or c.get("chainName")
        entry={
            "chainKey": key,
            "chainId": c.get("chainId"),
            "chainType": ctype,
            "rpcUrl": c.get("rpcUrl") or c.get("rpc")
        }
        if ctype=="L1" or "ghostchain" in name:
            entry["role"]="L1"
        elif ctype=="L2" or "ghostl2" in name:
            entry["role"]="L2"
        elif ctype=="L3" or "ghostl3" in name:
            entry["role"]="L3"
        else:
            continue
        chains.append(entry)

def rpc_send(url, raw_tx):
    payload={"jsonrpc":"2.0","id":1,"method":"eth_sendRawTransaction","params":[raw_tx]}
    data=json.dumps(payload).encode()
    req=urllib.request.Request(url,data=data,headers={"Content-Type":"application/json"})
    with urllib.request.urlopen(req,timeout=10) as resp:
        return json.load(resp)

def anchor_hash(chain_id):
    return hashlib.sha256((bundle_hash+str(chain_id)+timestamp).encode()).hexdigest()

result={
  "timestamp": timestamp,
  "bundleHash": bundle_hash,
  "attestationHash": attest_hash,
  "recursiveProofHash": recursive_hash,
  "chains": [],
  "status": "partial",
  "severity": "WARN"
}

l1_tx=None
for entry in chains:
    role=entry.get("role")
    chain_id=entry.get("chainId")
    if role=="L1" and rpc_l1:
        entry["rpcUrl"]=rpc_l1
    if role=="L2" and rpc_l2:
        entry["rpcUrl"]=rpc_l2
    if role=="L3" and rpc_l3:
        entry["rpcUrl"]=rpc_l3

    payload_hash=anchor_hash(chain_id)
    record={
        "chainKey": entry.get("chainKey"),
        "chainId": chain_id,
        "chainType": role,
        "rpcUrl": entry.get("rpcUrl"),
        "anchorHash": payload_hash,
        "bundleHash": bundle_hash,
        "status": "skipped",
        "txHash": None,
        "note": None,
        "l1AnchorTxHash": None
    }

    raw_tx=""
    if role=="L1":
        raw_tx=raw_l1
    elif role=="L2":
        raw_tx=raw_l2
        record["l1AnchorTxHash"]=l1_tx
        if not l1_tx:
            record["status"]="blocked"
            record["note"]="l1_anchor_missing"
            result["chains"].append(record)
            continue
    elif role=="L3":
        raw_tx=raw_l3
        record["l1AnchorTxHash"]=l1_tx
        if not l1_tx:
            record["status"]="blocked"
            record["note"]="l1_anchor_missing"
            result["chains"].append(record)
            continue

    if not raw_tx:
        record["note"]="missing_raw_tx"
        result["chains"].append(record)
        continue
    if not entry.get("rpcUrl"):
        record["note"]="missing_rpc_url"
        result["chains"].append(record)
        continue
    try:
        response=rpc_send(entry["rpcUrl"], raw_tx)
        tx_hash=response.get("result")
        record["txHash"]=tx_hash
        record["status"]="submitted"
        if role=="L1":
            l1_tx=tx_hash
    except Exception as exc:
        record["status"]="failed"
        record["note"]=str(exc)
    result["chains"].append(record)

submitted=sum(1 for c in result["chains"] if c.get("status")=="submitted")
failed=any(c.get("status")=="failed" for c in result["chains"])
blocked=any(c.get("status")=="blocked" for c in result["chains"])
skipped=any(c.get("status")=="skipped" for c in result["chains"])

if failed:
    result["status"]="failed"
    result["severity"]="CRITICAL"
elif blocked:
    result["status"]="partial"
    result["severity"]="CRITICAL"
elif skipped:
    result["status"]="partial"
    result["severity"]="WARN"
elif submitted==len(result["chains"]) and submitted>0:
    result["status"]="anchored"
    result["severity"]="INFO"

json.dump(result,open(out_path,"w"),indent=2)
PY
