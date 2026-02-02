#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODE="dev"
SNAPSHOT_DIR=""
OUT_DIR="$ROOT_DIR/ops/ai/threat-model"

usage() {
  cat <<'USAGE'
Usage: generate.sh [--mode dev|prod] --snapshot <dir>
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode) MODE="$2"; shift 2;;
    --snapshot) SNAPSHOT_DIR="$2"; shift 2;;
    -h|--help) usage; exit 0;;
    *) echo "Unknown argument: $1" >&2; exit 1;;
  esac
done

if [[ -z "$SNAPSHOT_DIR" ]]; then
  echo "Missing --snapshot" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

python3 - "$ROOT_DIR" "$SNAPSHOT_DIR" "$OUT_DIR" <<'PY'
import json,sys,os,datetime

root=sys.argv[1]
snap=sys.argv[2]
out_dir=sys.argv[3]

compose_files=os.path.join(snap,"compose-files.txt")
if not os.path.isfile(compose_files):
    raise SystemExit("Missing compose-files.txt in snapshot")

def load_json(path):
    return json.load(open(path))

services=[]
for line in open(compose_files):
    line=line.strip()
    if not line:
        continue
    rendered=os.path.join(snap,"compose",os.path.basename(line).replace(".yml",""),"")

configs=[p for p in os.listdir(os.path.join(snap,"compose")) if p.endswith(".json")]
for cfg in configs:
    payload=load_json(os.path.join(snap,"compose",cfg))
    for name,svc in payload.get("services",{}).items():
        services.append({"name": name, "labels": svc.get("labels",{}) or {}})

def classify(name):
    n=name.lower()
    if any(k in n for k in ("l1","l2","l3","geth","op-geth","sequencer","proposer","validator","rollup")):
        return "chain"
    if any(k in n for k in ("postgres","db","redis")):
        return "state"
    if any(k in n for k in ("ui","web","frontend")):
        return "ui"
    if any(k in n for k in ("api","gateway","rpc")):
        return "api"
    if any(k in n for k in ("prometheus","grafana","loki","otel","metrics","logs")):
        return "observability"
    return "service"

controls={
  "immutability": os.path.isfile(os.path.join(snap,"chain-data-fingerprints.json")) and os.path.isfile(os.path.join(snap,"chain-data-fingerprints-post.json")),
  "zk": os.path.isfile(os.path.join(snap,"immutability-proof.json")) or os.path.isfile(os.path.join(root,"ops/zk/immutability-proof.json")),
  "mev": os.path.isfile(os.path.join(snap,"mev-report.json")) or os.path.isfile(os.path.join(root,"ops/mev/mev-report.json")),
  "drift": os.path.isfile(os.path.join(snap,"drift-report.json")) or os.path.isfile(os.path.join(root,"ops/ai/drift/drift-report.json")),
  "kill_switch": os.path.isfile(os.path.join(root,"ops/security/kill-switch/activate.sh")),
  "did": os.path.isfile(os.path.join(root,"ops/docker/attestations/immutability-vc.json")),
  "tpm": os.path.isfile(os.path.join(root,"ops/docker/attestations/immutability-attestation.tpm.sig")),
}

def stride_threats(component):
    base=[
      ("Spoofing","MEDIUM"),
      ("Tampering","HIGH"),
      ("Repudiation","MEDIUM"),
      ("Information Disclosure","HIGH"),
      ("Denial of Service","HIGH"),
      ("Elevation of Privilege","MEDIUM")
    ]
    if component=="chain":
        base.append(("Chain State Corruption","CRITICAL"))
    return base

def linddun_threats(component):
    base=[
      ("Linkability","MEDIUM"),
      ("Identifiability","HIGH"),
      ("Non-repudiation","MEDIUM"),
      ("Detectability","MEDIUM"),
      ("Disclosure of Information","HIGH"),
      ("Unawareness","LOW"),
      ("Non-compliance","HIGH")
    ]
    if component=="chain":
        base.append(("Global Compliance Drift","CRITICAL"))
    return base

stride_lines=["# STRIDE Threat Model",""]
linddun_lines=["# LINDDUN Threat Model",""]

risk_entries=[]
overall_severity="INFO"

def bump(level):
    global overall_severity
    order=["INFO","WARN","CRITICAL"]
    if order.index(level) > order.index(overall_severity):
        overall_severity=level

for svc in services:
    name=svc["name"]
    ctype=classify(name)
    stride_lines.append(f"## {name} ({ctype})")
    for threat,sev in stride_threats(ctype):
        mitigated=controls.get("immutability") and controls.get("kill_switch")
        if threat in ("Chain State Corruption","Global Compliance Drift"):
            mitigated=controls.get("zk") and controls.get("drift")
        stride_lines.append(f"- {threat} [{sev}] - mitigated={str(mitigated).lower()}")
        if sev=="CRITICAL" and not mitigated:
            bump("CRITICAL")
            risk_entries.append({"service":name,"threat":threat,"severity":"CRITICAL","mitigated":False})
        elif sev in ("HIGH","CRITICAL") and not mitigated:
            bump("WARN")
            risk_entries.append({"service":name,"threat":threat,"severity":"HIGH","mitigated":False})
    stride_lines.append("")

    linddun_lines.append(f"## {name} ({ctype})")
    for threat,sev in linddun_threats(ctype):
        mitigated=controls.get("did") and controls.get("immutability")
        if threat == "Global Compliance Drift":
            mitigated=controls.get("drift") and controls.get("immutability")
        linddun_lines.append(f"- {threat} [{sev}] - mitigated={str(mitigated).lower()}")
        if sev=="CRITICAL" and not mitigated:
            bump("CRITICAL")
            risk_entries.append({"service":name,"threat":threat,"severity":"CRITICAL","mitigated":False})
    linddun_lines.append("")

stride_path=os.path.join(out_dir,"stride-model.md")
linddun_path=os.path.join(out_dir,"linddun-model.md")
with open(stride_path,"w") as f:
    f.write("\n".join(stride_lines))
with open(linddun_path,"w") as f:
    f.write("\n".join(linddun_lines))

risk_summary={
  "timestamp": datetime.datetime.utcnow().isoformat()+"Z",
  "severity": overall_severity,
  "risks": risk_entries,
  "controls": controls
}
json.dump(risk_summary,open(os.path.join(out_dir,"risk-summary.json"),"w"),indent=2)
PY

cp "$OUT_DIR/stride-model.md" "$SNAPSHOT_DIR/stride-model.md"
cp "$OUT_DIR/linddun-model.md" "$SNAPSHOT_DIR/linddun-model.md"
cp "$OUT_DIR/risk-summary.json" "$SNAPSHOT_DIR/risk-summary.json"
