#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODE="dev"
SNAPSHOT_DIR=""
RULES_PATH="$ROOT_DIR/ops/governance/governance-rules.json"
OUT_PATH="$ROOT_DIR/ops/governance/enforcement-log.json"

usage() {
  cat <<'USAGE'
Usage: enforce.sh --snapshot <dir> [--mode dev|prod] [--rules <path>] [--out <path>]
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --snapshot) SNAPSHOT_DIR="$2"; shift 2;;
    --mode) MODE="$2"; shift 2;;
    --rules) RULES_PATH="$2"; shift 2;;
    --out) OUT_PATH="$2"; shift 2;;
    -h|--help) usage; exit 0;;
    *) echo "Unknown argument: $1" >&2; exit 1;;
  esac
done

if [[ -z "$SNAPSHOT_DIR" ]]; then
  echo "Missing --snapshot" >&2
  exit 1
fi

python3 - "$ROOT_DIR" "$SNAPSHOT_DIR" "$RULES_PATH" "$OUT_PATH" "$MODE" <<'PY'
import json,os,sys,datetime,urllib.request

root=sys.argv[1]
snap=sys.argv[2]
rules_path=sys.argv[3]
out_path=sys.argv[4]
mode=sys.argv[5]

rules=json.load(open(rules_path))
req=rules.get("requirements",{})
max_sev=rules.get("maxSeverity","WARN")
onchain_required=rules.get("onchainEventRequired",True)

def read(path, default=None):
    if not os.path.isfile(path):
        return default
    with open(path) as f:
        return json.load(f)

def sev_rank(s):
    order={"INFO":0,"WARN":1,"CRITICAL":2}
    return order.get(s,0)

issues=[]
severity="INFO"

def bump(level):
    global severity
    if sev_rank(level)>sev_rank(severity):
        severity=level

def issue(code, level, message):
    issues.append({
        "code": code,
        "severity": level,
        "message": message
    })
    bump(level)

gas=read(os.path.join(snap,"gas-token.json"),{})
if req.get("requireGasToken",True) and not gas.get("address"):
    issue("gas_token_missing","CRITICAL","Gas token missing in snapshot")

recursive_onchain=read(os.path.join(snap,"recursive-proof.onchain.json"),{})
if req.get("requireRecursiveProofOnchain",True):
    if recursive_onchain.get("status") != "submitted":
        issue("recursive_onchain_missing","CRITICAL","Recursive proof not submitted on-chain")

cross=read(os.path.join(snap,"cross-chain-anchors.json"),{})
if req.get("requireCrossChainAnchors",True):
    if cross.get("status") != "anchored":
        issue("cross_chain_anchor_incomplete","CRITICAL","Cross-chain anchors incomplete")

quorum=read(os.path.join(snap,"quorum-attestation.json"),{})
if req.get("requireQuorum",True):
    if quorum.get("status") not in ("satisfied","ok"):
        issue("quorum_not_satisfied","CRITICAL","Quorum attestation not satisfied")

policy=read(os.path.join(snap,"policy-state.json"),{})
if req.get("requirePolicyHealthy",True):
    if policy.get("severity") in ("CRITICAL","WARN"):
        issue("policy_unhealthy","CRITICAL","Policy state not healthy")

zkml=read(os.path.join(root,"ops","zkml","model-proof.json"),{})
if req.get("requireZkmlProof",True):
    if zkml.get("status") != "verified":
        issue("zkml_proof_missing","CRITICAL","zkML proof not verified")

status="ENFORCED" if severity=="INFO" else "FAILED"

event_status="skipped"
event_tx=None
event_note=None
raw_tx=os.getenv("GHOST_GOVERNANCE_EVENT_RAW_TX","")
rpc=os.getenv("GHOST_GOVERNANCE_RPC_URL","")

def rpc_send(url, raw):
    payload={"jsonrpc":"2.0","id":1,"method":"eth_sendRawTransaction","params":[raw]}
    data=json.dumps(payload).encode()
    req=urllib.request.Request(url,data=data,headers={"Content-Type":"application/json"})
    with urllib.request.urlopen(req,timeout=10) as resp:
        return json.load(resp)

if onchain_required:
    if not raw_tx or not rpc:
        issue("governance_event_missing","CRITICAL","Governance event raw tx or RPC missing")
    else:
        try:
            resp=rpc_send(rpc, raw_tx)
            event_tx=resp.get("result")
            event_status="submitted"
        except Exception as exc:
            event_status="failed"
            event_note=str(exc)
            issue("governance_event_failed","CRITICAL","Governance event submission failed")

report={
  "timestamp": datetime.datetime.utcnow().isoformat()+"Z",
  "mode": mode,
  "status": status,
  "severity": severity,
  "issues": issues,
  "onchainEvent": {
    "required": onchain_required,
    "status": event_status,
    "txHash": event_tx,
    "note": event_note
  }
}

json.dump(report,open(out_path,"w"),indent=2)
if sev_rank(severity)>sev_rank(max_sev):
    raise SystemExit("Governance enforcement failed")
PY
