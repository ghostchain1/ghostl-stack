#!/usr/bin/env bash
set -Eeuo pipefail

ATTEST=""
MERKLE=""
OCI=""
VC=""
OUT_PATH=""
RPC_URL=""
RAW_TX="${GHOST_NOTARIZATION_RAW_TX:-}"

usage() {
  cat <<'USAGE'
Usage: notarize.sh --attestation <path> --merkle <path> --oci <path> --vc <path> --out <path> [--rpc <url>]
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --attestation) ATTEST="$2"; shift 2;;
    --merkle) MERKLE="$2"; shift 2;;
    --oci) OCI="$2"; shift 2;;
    --vc) VC="$2"; shift 2;;
    --out) OUT_PATH="$2"; shift 2;;
    --rpc) RPC_URL="$2"; shift 2;;
    -h|--help) usage; exit 0;;
    *) echo "Unknown argument: $1" >&2; exit 1;;
  esac
done

if [[ -z "$ATTEST" || -z "$MERKLE" || -z "$OCI" || -z "$VC" || -z "$OUT_PATH" ]]; then
  echo "Missing required arguments." >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CHAIN_CONFIG_PATH="${GHOST_CHAIN_CONFIG_PATH:-$ROOT_DIR/services/ghost-pil/config/chains.json}"
if [[ ! -f "$CHAIN_CONFIG_PATH" ]]; then
  CHAIN_CONFIG_PATH="$ROOT_DIR/services/ghost-gas-engine/config/chains.json"
fi

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

python3 - "$ATTEST" "$MERKLE" "$OCI" "$VC" "$OUT_PATH" "$RPC_URL" "$RAW_TX" <<'PY'
import hashlib,json,sys,urllib.request,datetime

attest=sys.argv[1]
merkle=sys.argv[2]
oci=sys.argv[3]
vc=sys.argv[4]
out_path=sys.argv[5]
rpc_url=sys.argv[6] or ""
raw_tx=sys.argv[7] or ""

def sha256(path):
    h=hashlib.sha256()
    with open(path,"rb") as f:
        h.update(f.read())
    return h.hexdigest()

payload_hash=hashlib.sha256(
    (sha256(attest)+sha256(merkle)+sha256(oci)+sha256(vc)).encode()
).hexdigest()

result={
  "timestamp": datetime.datetime.utcnow().isoformat()+"Z",
  "notarizationHash": payload_hash,
  "status": "skipped",
  "txHash": None,
  "blockNumber": None,
  "rpcUrl": rpc_url or None,
  "note": None
}

if not raw_tx:
    result["note"]="missing_raw_tx"
    json.dump(result,open(out_path,"w"),indent=2)
    raise SystemExit(0)

if not rpc_url:
    result["note"]="missing_rpc_url"
    json.dump(result,open(out_path,"w"),indent=2)
    raise SystemExit(0)

try:
    payload={"jsonrpc":"2.0","id":1,"method":"eth_sendRawTransaction","params":[raw_tx]}
    data=json.dumps(payload).encode()
    req=urllib.request.Request(rpc_url,data=data,headers={"Content-Type":"application/json"})
    with urllib.request.urlopen(req,timeout=10) as resp:
        response=json.load(resp)
    tx_hash=response.get("result")
    result["txHash"]=tx_hash
    result["status"]="submitted"
except Exception as exc:
    result["status"]="failed"
    result["note"]=str(exc)

json.dump(result,open(out_path,"w"),indent=2)
PY
