#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODE="dev"
SNAPSHOT_DIR=""
RULES_PATH="$ROOT_DIR/ops/policy/policy-rules.json"
POLICY_DIR="$ROOT_DIR/ops/policy"

usage() {
  cat <<'USAGE'
Usage: self-heal.sh --snapshot <dir> [--mode dev|prod] [--rules <path>]
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --snapshot) SNAPSHOT_DIR="$2"; shift 2;;
    --mode) MODE="$2"; shift 2;;
    --rules) RULES_PATH="$2"; shift 2;;
    -h|--help) usage; exit 0;;
    *) echo "Unknown argument: $1" >&2; exit 1;;
  esac
done

if [[ -z "$SNAPSHOT_DIR" ]]; then
  echo "Missing --snapshot" >&2
  exit 1
fi

mkdir -p "$POLICY_DIR"

python3 - "$ROOT_DIR" "$SNAPSHOT_DIR" "$RULES_PATH" "$POLICY_DIR" "$MODE" <<'PY'
import json,os,sys,datetime,subprocess

root=sys.argv[1]
snap=sys.argv[2]
rules_path=sys.argv[3]
out_dir=sys.argv[4]
mode=sys.argv[5]

rules=json.load(open(rules_path))
req=rules.get("requirements",{})

def read(path, default=None):
    if not os.path.isfile(path):
        return default
    with open(path) as f:
        return json.load(f)

def write(path, payload):
    with open(path,"w") as f:
        json.dump(payload,f,indent=2)

issues=[]
actions=[]
severity="HEALTHY"

def bump(level):
    global severity
    order=["HEALTHY","WARN","CRITICAL"]
    if order.index(level) > order.index(severity):
        severity=level

def issue(code, level, message, auto=False):
    issues.append({
        "code": code,
        "severity": level,
        "message": message,
        "autoRepairable": auto
    })
    bump(level)

def run_action(name, cmd):
    status="skipped"
    detail=None
    try:
        if cmd:
            result=subprocess.run(cmd,check=False,capture_output=True,text=True)
            status="success" if result.returncode==0 else "failed"
            detail=(result.stdout+result.stderr).strip()
    except Exception as exc:
        status="failed"
        detail=str(exc)
    actions.append({
        "action": name,
        "status": status,
        "detail": detail
    })

gas=read(os.path.join(snap,"gas-token.json"),{})
gas_addr=gas.get("address")
if req.get("requireGasToken",True):
    if not gas_addr:
        issue("gas_token_missing","CRITICAL","Gas token address missing from snapshot")

quorum_selection=os.path.join(snap,"quorum-selection.json")
if req.get("requireQuorumSelection",True) and not os.path.isfile(quorum_selection):
    issue("quorum_selection_missing","WARN","Quorum selection missing",auto=True)
    run_action("select_quorum",[
        os.path.join(root,"ops","geo-risk","select-quorum.sh"),
        "--seed", os.path.basename(snap),
        "--out", os.path.join(root,"ops","geo-risk","quorum-selection.json")
    ])

evidence=os.path.join(snap,"evidence-bundle.json")
if req.get("requireEvidenceBundle",True) and not os.path.isfile(evidence):
    issue("evidence_bundle_missing","WARN","Compliance evidence bundle missing",auto=True)
    run_action("build_evidence_bundle",[
        os.path.join(root,"ops","compliance","bundle.sh"),
        "--snapshot", snap
    ])

threat=os.path.join(snap,"risk-summary.json")
if req.get("requireThreatModel",True) and not os.path.isfile(threat):
    issue("threat_model_missing","WARN","Threat model summary missing",auto=True)
    run_action("generate_threat_model",[
        os.path.join(root,"ops","ai","threat-model","generate.sh"),
        "--mode", mode,
        "--snapshot", snap
    ])

anchors=os.path.join(root,"ops","onchain","cross-chain-anchors.json")
if req.get("requireCrossChainAnchors",True):
    if not os.path.isfile(anchors):
        issue("cross_chain_anchors_missing","CRITICAL","Cross-chain anchors missing",auto=True)
        run_action("anchor_cross_chain",[
            os.path.join(root,"ops","onchain","anchor-crosschain.sh"),
            "--attestation", os.path.join(root,"ops","docker","attestations","immutability-attestation.json"),
            "--recursive", os.path.join(root,"ops","zk","recursive-proof.json"),
            "--out", anchors
        ])
    else:
        anchor_data=read(anchors, {})
        if anchor_data.get("status") != "anchored":
            issue("cross_chain_anchors_incomplete","CRITICAL","Cross-chain anchors not fully anchored")

quorum_att=read(os.path.join(snap,"quorum-attestation.json"),{})
if quorum_att.get("status") and quorum_att.get("status") != "satisfied":
    issue("quorum_not_satisfied","WARN","Quorum attestation not satisfied")

anomaly=read(os.path.join(snap,"anomaly-report.json"),{})
if anomaly.get("severity") == "CRITICAL":
    issue("anomaly_critical","CRITICAL","Anomaly severity CRITICAL")

drift=read(os.path.join(snap,"drift-report.json"),{})
if drift.get("severity") == "CRITICAL":
    issue("drift_critical","CRITICAL","Drift severity CRITICAL")

mev=read(os.path.join(snap,"mev-report.json"),{})
if mev.get("severity") == "CRITICAL":
    issue("mev_critical","CRITICAL","MEV severity CRITICAL")

policy_state={
    "timestamp": datetime.datetime.utcnow().isoformat()+"Z",
    "mode": mode,
    "severity": severity,
    "issues": issues
}

write(os.path.join(out_dir,"policy-state.json"), policy_state)
write(os.path.join(out_dir,"healing-actions.json"), {"actions": actions})
write(os.path.join(out_dir,"self-heal-log.json"), {
    "timestamp": policy_state["timestamp"],
    "mode": mode,
    "severity": severity,
    "actions": actions,
    "issues": issues
})
PY
