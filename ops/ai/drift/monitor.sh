#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODE="dev"
SNAPSHOT_DIR=""
DRIFT_DIR="$ROOT_DIR/ops/ai/drift"
POLICY_PATH="$DRIFT_DIR/drift-policy.json"
BASELINE_PATH="$DRIFT_DIR/baseline.json"
REPORT_PATH="$DRIFT_DIR/drift-report.json"
KILL_SWITCH="false"

usage() {
  cat <<'USAGE'
Usage: monitor.sh [--mode dev|prod] [--snapshot <dir>] [--kill-switch]
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode) MODE="$2"; shift 2;;
    --snapshot) SNAPSHOT_DIR="$2"; shift 2;;
    --kill-switch) KILL_SWITCH="true"; shift;;
    -h|--help) usage; exit 0;;
    *) echo "Unknown argument: $1" >&2; exit 1;;
  esac
done

CHAIN_CONFIG_PATH="${GHOST_CHAIN_CONFIG_PATH:-$ROOT_DIR/services/ghost-pil/config/chains.json}"
if [[ ! -f "$CHAIN_CONFIG_PATH" ]]; then
  CHAIN_CONFIG_PATH="$ROOT_DIR/services/ghost-gas-engine/config/chains.json"
fi
if [[ ! -f "$CHAIN_CONFIG_PATH" ]]; then
  echo "Chain config file not found. Set GHOST_CHAIN_CONFIG_PATH." >&2
  exit 1
fi

python3 - "$CHAIN_CONFIG_PATH" "$POLICY_PATH" "$BASELINE_PATH" "$REPORT_PATH" <<'PY'
import json,sys,urllib.request,time,datetime,os

chain_path=sys.argv[1]
policy_path=sys.argv[2]
baseline_path=sys.argv[3]
report_path=sys.argv[4]

chains=json.load(open(chain_path)).get("chains",[])
policy=json.load(open(policy_path))
rules=policy.get("rules",{})

def rpc_call(url, method, params=None):
    payload={"jsonrpc":"2.0","id":1,"method":method,"params":params or []}
    data=json.dumps(payload).encode()
    req=urllib.request.Request(url,data=data,headers={"Content-Type":"application/json"})
    start=time.time()
    with urllib.request.urlopen(req,timeout=6) as resp:
        elapsed=(time.time()-start)*1000.0
        return json.load(resp), elapsed

def snapshot(baseline_block_numbers=None):
    entries=[]
    for chain in chains:
        url=chain.get("rpcUrl") or chain.get("rpc")
        entry={
            "chainId":chain.get("chainId"),
            "chainKey":chain.get("key"),
            "rpcUrl":url,
            "latencyMs":None,
            "baselineBlockNumber": None,
            "baselineBlockHash": None,
            "baselineStateRoot": None,
            "baselineReceiptsRoot": None,
            "latestBlockNumber": None
        }
        if not url:
            entry["error"]="missing_rpc"
            entries.append(entry)
            continue
        try:
            chain_id,lat1=rpc_call(url,"eth_chainId")
            latest_block,lat2=rpc_call(url,"eth_blockNumber")
            entry["rpcChainId"]=chain_id.get("result")
            entry["latestBlockNumber"]=latest_block.get("result")
            target_block=None
            if baseline_block_numbers and chain.get("key") in baseline_block_numbers:
                target_block=baseline_block_numbers[chain.get("key")]
            if not target_block:
                target_block=entry["latestBlockNumber"]
            block,lat3=rpc_call(url,"eth_getBlockByNumber",[target_block, False])
            entry["baselineBlockNumber"]=target_block
            block_result=block.get("result") or {}
            entry["baselineBlockHash"]=block_result.get("hash")
            entry["baselineStateRoot"]=block_result.get("stateRoot")
            entry["baselineReceiptsRoot"]=block_result.get("receiptsRoot")
            entry["latencyMs"]=round((lat1+lat2+lat3)/3.0,2)
        except Exception as exc:
            entry["error"]=str(exc)
        entries.append(entry)
    return {"timestamp": datetime.datetime.utcnow().isoformat()+"Z", "chains": entries}

if not os.path.isfile(baseline_path):
    baseline=snapshot()
    json.dump(baseline,open(baseline_path,"w"),indent=2)
    json.dump({"timestamp": baseline["timestamp"], "severity": "INFO", "findings": [], "summary": "Baseline created"},open(report_path,"w"),indent=2)
    sys.exit(0)

baseline=json.load(open(baseline_path))
base_numbers={c.get("chainKey"): c.get("baselineBlockNumber") for c in baseline.get("chains",[]) if c.get("baselineBlockNumber")}
current=snapshot(base_numbers)
base_map={c.get("chainKey"):c for c in baseline.get("chains",[])}
cur_map={c.get("chainKey"):c for c in current.get("chains",[])}

findings=[]
severity="INFO"
def bump(level):
    nonlocal severity
    order=["INFO","WARN","CRITICAL"]
    if order.index(level) > order.index(severity):
        severity=level

for key,base in base_map.items():
    cur=cur_map.get(key, {})
    if base.get("rpcChainId") and cur.get("rpcChainId") and base["rpcChainId"]!=cur["rpcChainId"]:
        findings.append({"chainKey": key, "issue": "chain_id_changed", "severity": "CRITICAL"})
        bump("CRITICAL")
    if base.get("latestBlockNumber") and cur.get("latestBlockNumber"):
        try:
            base_block=int(base["latestBlockNumber"],16)
            cur_block=int(cur["latestBlockNumber"],16)
            if cur_block < base_block - rules.get("maxHeightRegression",0):
                findings.append({"chainKey": key, "issue": "block_height_regression", "severity": "CRITICAL"})
                bump("CRITICAL")
        except Exception:
            pass
    if base.get("baselineBlockHash") and cur.get("baselineBlockHash") and base["baselineBlockHash"]!=cur["baselineBlockHash"]:
        findings.append({"chainKey": key, "issue": "baseline_block_hash_changed", "severity": "CRITICAL"})
        bump("CRITICAL")
    if base.get("baselineStateRoot") and cur.get("baselineStateRoot") and base["baselineStateRoot"]!=cur["baselineStateRoot"]:
        findings.append({"chainKey": key, "issue": "baseline_state_root_changed", "severity": "CRITICAL"})
        bump("CRITICAL")
    if base.get("baselineReceiptsRoot") and cur.get("baselineReceiptsRoot") and base["baselineReceiptsRoot"]!=cur["baselineReceiptsRoot"]:
        findings.append({"chainKey": key, "issue": "baseline_receipts_root_changed", "severity": "CRITICAL"})
        bump("CRITICAL")
    if cur.get("error"):
        if not rules.get("allowRpcErrors", False):
            findings.append({"chainKey": key, "issue": "rpc_error", "severity": "WARN"})
            bump("WARN")
    if base.get("latencyMs") and cur.get("latencyMs"):
        limit=rules.get("maxLatencyMs",1500)
        mult=rules.get("maxLatencyMultiplier",3.0)
        if cur["latencyMs"] > limit or cur["latencyMs"] > base["latencyMs"] * mult:
            findings.append({"chainKey": key, "issue": "rpc_latency_drift", "severity": "WARN"})
            bump("WARN")

report={
  "timestamp": current["timestamp"],
  "severity": severity,
  "findings": findings,
  "summary": "Drift evaluation completed"
}
json.dump(report,open(report_path,"w"),indent=2)
PY

DRIFT_SEVERITY=$(python3 - "$REPORT_PATH" <<'PY'
import json,sys
data=json.load(open(sys.argv[1]))
print(data.get("severity","INFO"))
PY
)

if [[ "$DRIFT_SEVERITY" == "CRITICAL" && "$KILL_SWITCH" == "true" ]]; then
  if [[ -n "$SNAPSHOT_DIR" && -x "$ROOT_DIR/ops/security/kill-switch/activate.sh" ]]; then
    "$ROOT_DIR/ops/security/kill-switch/activate.sh" --snapshot "$SNAPSHOT_DIR" --mode "$MODE" --reason "drift_critical" || true
  fi
fi
