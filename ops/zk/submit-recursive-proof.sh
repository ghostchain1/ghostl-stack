#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROOF_PATH=""
OUT_PATH=""
RPC_URL="${GHOST_RECURSIVE_VERIFY_RPC_URL:-}"
RAW_TX="${GHOST_RECURSIVE_VERIFY_RAW_TX:-}"

usage() {
  cat <<'USAGE'
Usage: submit-recursive-proof.sh --proof <path> --out <path> [--rpc <url>]
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --proof) PROOF_PATH="$2"; shift 2;;
    --out) OUT_PATH="$2"; shift 2;;
    --rpc) RPC_URL="$2"; shift 2;;
    -h|--help) usage; exit 0;;
    *) echo "Unknown argument: $1" >&2; exit 1;;
  esac
done

if [[ -z "$PROOF_PATH" || -z "$OUT_PATH" ]]; then
  echo "Missing required arguments." >&2
  exit 1
fi

CHAIN_CONFIG_PATH="${GHOST_CHAIN_CONFIG_PATH:-$ROOT_DIR/services/ghost-pil/config/chains.json}"
if [[ -z "$RPC_URL" && -f "$CHAIN_CONFIG_PATH" ]]; then
  RPC_URL=$(python3 - "$CHAIN_CONFIG_PATH" <<'PY'
import json,sys
chains=json.load(open(sys.argv[1])).get("chains",[])
for c in chains:
    ctype=(c.get("chainType") or c.get("layer") or "").upper()
    name=(c.get("chainName") or c.get("name") or "").lower()
    if ctype=="L1" or "ghostchain" in name:
        url=c.get("rpcUrl") or c.get("rpc")
        if url:
            print(url)
            raise SystemExit(0)
print("")
PY
)
fi

python3 - "$PROOF_PATH" "$OUT_PATH" "$RPC_URL" "$RAW_TX" <<'PY'
import hashlib,json,sys,urllib.request,datetime

proof=sys.argv[1]
out_path=sys.argv[2]
rpc_url=sys.argv[3] or ""
raw_tx=sys.argv[4] or ""

def sha256(path):
    h=hashlib.sha256()
    with open(path,"rb") as f:
        h.update(f.read())
    return h.hexdigest()

proof_hash=sha256(proof)
payload={
  "timestamp": datetime.datetime.utcnow().isoformat()+"Z",
  "proofHash": proof_hash,
  "status": "skipped",
  "txHash": None,
  "blockNumber": None,
  "rpcUrl": rpc_url or None,
  "note": None
}

if not raw_tx:
    payload["note"]="missing_raw_tx"
    json.dump(payload,open(out_path,"w"),indent=2)
    raise SystemExit(0)

if not rpc_url:
    payload["note"]="missing_rpc_url"
    json.dump(payload,open(out_path,"w"),indent=2)
    raise SystemExit(0)

try:
    req_payload={"jsonrpc":"2.0","id":1,"method":"eth_sendRawTransaction","params":[raw_tx]}
    data=json.dumps(req_payload).encode()
    req=urllib.request.Request(rpc_url,data=data,headers={"Content-Type":"application/json"})
    with urllib.request.urlopen(req,timeout=10) as resp:
        response=json.load(resp)
    tx_hash=response.get("result")
    payload["txHash"]=tx_hash
    payload["status"]="submitted"
except Exception as exc:
    payload["status"]="failed"
    payload["note"]=str(exc)

json.dump(payload,open(out_path,"w"),indent=2)
PY
