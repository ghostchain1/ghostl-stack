#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODE="dev"
SNAPSHOT_DIR=""
PROOF_PATH="${ZKML_PROOF_PATH:-}"
OUT_DIR="$ROOT_DIR/ops/zkml"

usage() {
  cat <<'USAGE'
Usage: learn.sh --snapshot <dir> [--mode dev|prod] [--proof <path>]
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --snapshot) SNAPSHOT_DIR="$2"; shift 2;;
    --mode) MODE="$2"; shift 2;;
    --proof) PROOF_PATH="$2"; shift 2;;
    -h|--help) usage; exit 0;;
    *) echo "Unknown argument: $1" >&2; exit 1;;
  esac
done

if [[ -z "$SNAPSHOT_DIR" ]]; then
  echo "Missing --snapshot" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

python3 - "$SNAPSHOT_DIR" "$OUT_DIR" "$MODE" "$PROOF_PATH" <<'PY'
import json,sys,os,datetime,hashlib

snap=sys.argv[1]
out_dir=sys.argv[2]
mode=sys.argv[3]
proof_path=sys.argv[4]

def read(path, default=None):
    if not os.path.isfile(path):
        return default
    with open(path) as f:
        return json.load(f)

def sha256(path):
    h=hashlib.sha256()
    with open(path,"rb") as f:
        h.update(f.read())
    return h.hexdigest()

anomaly=read(os.path.join(snap,"anomaly-report.json"),{})
drift=read(os.path.join(snap,"drift-report.json"),{})
mev=read(os.path.join(snap,"mev-report.json"),{})

def delta_for(sev):
    if sev=="CRITICAL":
        return 0.2
    if sev=="WARN":
        return 0.1
    return 0.0

recommendations=[
  {
    "policy":"gasSafetyMargin",
    "delta": delta_for(anomaly.get("severity","INFO")),
    "reason":"anomaly_severity"
  },
  {
    "policy":"driftSensitivity",
    "delta": delta_for(drift.get("severity","INFO")),
    "reason":"drift_severity"
  },
  {
    "policy":"mevPenalty",
    "delta": delta_for(mev.get("severity","INFO")),
    "reason":"mev_severity"
  }
]

policy_update={
  "timestamp": datetime.datetime.utcnow().isoformat()+"Z",
  "mode": mode,
  "inputs": {
    "anomalySeverity": anomaly.get("severity"),
    "driftSeverity": drift.get("severity"),
    "mevSeverity": mev.get("severity")
  },
  "recommendations": recommendations,
  "applied": False
}

proof_status="missing"
proof_hash=None
proof_valid=False
note="proof_not_provided"

if proof_path:
    if os.path.isfile(proof_path):
        proof=read(proof_path, {})
        proof_hash=sha256(proof_path)
        proof_valid=bool(proof.get("valid") or proof.get("verificationStatus")=="verified")
        proof_status="verified" if proof_valid else "invalid"
        note="external_proof"
    else:
        proof_status="missing"

model_proof={
  "timestamp": policy_update["timestamp"],
  "status": proof_status,
  "proofHash": proof_hash,
  "valid": proof_valid,
  "proofType": "external-zkml",
  "note": note
}

learning_log={
  "timestamp": policy_update["timestamp"],
  "mode": mode,
  "policyUpdate": policy_update,
  "modelProof": model_proof
}

json.dump(policy_update,open(os.path.join(out_dir,"policy-update.json"),"w"),indent=2)
json.dump(model_proof,open(os.path.join(out_dir,"model-proof.json"),"w"),indent=2)
json.dump(learning_log,open(os.path.join(out_dir,"learning-log.json"),"w"),indent=2)
PY
