#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODE="dev"
SNAPSHOT_DIR=""
CONFIG_PATH="$ROOT_DIR/ops/mev/mev-monitor-config.json"
OUT_PATH="$ROOT_DIR/ops/mev/mev-report.json"

usage() {
  cat <<'USAGE'
Usage: mev-monitor.sh [--mode dev|prod] [--snapshot <dir>] [--config <path>] [--out <path>]
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode) MODE="$2"; shift 2;;
    --snapshot) SNAPSHOT_DIR="$2"; shift 2;;
    --config) CONFIG_PATH="$2"; shift 2;;
    --out) OUT_PATH="$2"; shift 2;;
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

python3 - "$CHAIN_CONFIG_PATH" "$CONFIG_PATH" "$OUT_PATH" <<'PY'
import json,sys,urllib.request,time,datetime,statistics

chain_path=sys.argv[1]
config_path=sys.argv[2]
out_path=sys.argv[3]

chains=json.load(open(chain_path)).get("chains",[])
config=json.load(open(config_path))

sample_blocks=int(config.get("sampleBlocks",20))
thresholds=config.get("severityThresholds",{})

def rpc_call(url, method, params=None):
    payload={"jsonrpc":"2.0","id":1,"method":method,"params":params or []}
    data=json.dumps(payload).encode()
    req=urllib.request.Request(url,data=data,headers={"Content-Type":"application/json"})
    with urllib.request.urlopen(req,timeout=8) as resp:
        return json.load(resp)

def hex_to_int(val):
    if not val:
        return 0
    try:
        return int(val,16)
    except Exception:
        return 0

def fee_value(tx):
    if isinstance(tx,dict):
        if tx.get("maxPriorityFeePerGas"):
            return hex_to_int(tx.get("maxPriorityFeePerGas"))
        if tx.get("gasPrice"):
            return hex_to_int(tx.get("gasPrice"))
    return 0

def is_non_increasing(values):
    return all(values[i] >= values[i+1] for i in range(len(values)-1))

overall_severity="INFO"
reports=[]

def bump(level):
    global overall_severity
    order=["INFO","WARN","CRITICAL"]
    if order.index(level) > order.index(overall_severity):
        overall_severity=level

for chain in chains:
    url=chain.get("rpcUrl") or chain.get("rpc")
    entry={
        "chainKey": chain.get("key"),
        "chainId": chain.get("chainId"),
        "chainType": chain.get("chainType") or chain.get("layer"),
        "rpcUrl": url,
        "blocksAnalyzed": 0,
        "reorderBlocks": 0,
        "reorderRate": 0.0,
        "avgPriorityFeeSkew": 0.0,
        "severity": "INFO",
        "notes": []
    }
    if not url:
        entry["severity"]="WARN"
        entry["notes"].append("missing_rpc")
        bump("WARN")
        reports.append(entry)
        continue
    try:
        latest = rpc_call(url,"eth_blockNumber").get("result")
        if not latest:
            entry["severity"]="WARN"
            entry["notes"].append("missing_latest_block")
            bump("WARN")
            reports.append(entry)
            continue
        latest_num=int(latest,16)
        skew_values=[]
        for offset in range(sample_blocks):
            block_num=latest_num - offset
            if block_num < 0:
                break
            block_hex=hex(block_num)
            block = rpc_call(url,"eth_getBlockByNumber",[block_hex, True]).get("result")
            if not block:
                continue
            txs=block.get("transactions") or []
            if len(txs) < 2:
                continue
            fees=[fee_value(tx) for tx in txs]
            if not is_non_increasing(fees):
                entry["reorderBlocks"] += 1
            entry["blocksAnalyzed"] += 1
            if fees:
                median=statistics.median(fees)
                if median == 0:
                    skew=0.0
                else:
                    skew=max(fees) / median
                skew_values.append(skew)
        if entry["blocksAnalyzed"] > 0:
            entry["reorderRate"]=round(entry["reorderBlocks"]/entry["blocksAnalyzed"],4)
        if skew_values:
            entry["avgPriorityFeeSkew"]=round(statistics.mean(skew_values),4)
    except Exception as exc:
        entry["severity"]="WARN"
        entry["notes"].append(f"rpc_error:{exc}")
        bump("WARN")
        reports.append(entry)
        continue

    warn_reorder=float(thresholds.get("warnReorderRate",0.2))
    crit_reorder=float(thresholds.get("criticalReorderRate",0.5))
    warn_skew=float(thresholds.get("warnPriorityFeeSkew",8.0))
    crit_skew=float(thresholds.get("criticalPriorityFeeSkew",15.0))

    if entry["reorderRate"] >= crit_reorder or entry["avgPriorityFeeSkew"] >= crit_skew:
        entry["severity"]="CRITICAL"
        bump("CRITICAL")
    elif entry["reorderRate"] >= warn_reorder or entry["avgPriorityFeeSkew"] >= warn_skew:
        entry["severity"]="WARN"
        bump("WARN")

    reports.append(entry)

payload={
  "timestamp": datetime.datetime.utcnow().isoformat()+"Z",
  "mode": "MEV_MONITOR",
  "severity": overall_severity,
  "chains": reports,
  "summary": "Deterministic ordering + fee skew analysis"
}

json.dump(payload,open(out_path,"w"),indent=2)
PY

if [[ -n "$SNAPSHOT_DIR" && -f "$OUT_PATH" ]]; then
  cp "$OUT_PATH" "$SNAPSHOT_DIR/mev-report.json"
fi
