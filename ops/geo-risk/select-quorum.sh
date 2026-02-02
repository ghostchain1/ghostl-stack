#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SEED=""
OUT_PATH="$ROOT_DIR/ops/geo-risk/quorum-selection.json"
SCORES_PATH="$ROOT_DIR/ops/geo-risk/region-scores.json"
POLICY_MIN_REGIONS="${GEO_MIN_REGIONS:-3}"
MAX_RISK_SCORE="${GEO_MAX_RISK_SCORE:-12}"
ROTATION_HOURS="${GEO_ROTATION_HOURS:-24}"

usage() {
  cat <<'USAGE'
Usage: select-quorum.sh --seed <timestamp> [--out <path>] [--scores <path>]
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --seed) SEED="$2"; shift 2;;
    --out) OUT_PATH="$2"; shift 2;;
    --scores) SCORES_PATH="$2"; shift 2;;
    -h|--help) usage; exit 0;;
    *) echo "Unknown argument: $1" >&2; exit 1;;
  esac
done

if [[ -z "$SEED" ]]; then
  echo "Missing --seed" >&2
  exit 1
fi

python3 - "$SCORES_PATH" "$OUT_PATH" "$SEED" "$POLICY_MIN_REGIONS" "$MAX_RISK_SCORE" "$ROTATION_HOURS" <<'PY'
import json,sys,hashlib,datetime

scores_path=sys.argv[1]
out_path=sys.argv[2]
seed=sys.argv[3]
min_regions=int(sys.argv[4])
max_risk=int(sys.argv[5])
rotation_hours=int(sys.argv[6])

payload=json.load(open(scores_path))
regions=payload.get("regions",[])

def total_risk(r):
    return r.get("regulatoryRisk",0)+r.get("sanctionsRisk",0)+r.get("sovereigntyRisk",0)

eligible=[]
excluded=[]
for r in regions:
    score=total_risk(r)
    if score <= max_risk:
        eligible.append({**r,"riskScore":score})
    else:
        excluded.append({**r,"riskScore":score})

eligible.sort(key=lambda r: (r["riskScore"], -r.get("politicalStability",0), r.get("region")))

seed_hash=int(hashlib.sha256(seed.encode()).hexdigest(),16)
offset=seed_hash % max(1,len(eligible))

selected=[]
for i in range(min_regions):
    if not eligible:
        break
    selected.append(eligible[(offset+i)%len(eligible)]["region"])

result={
  "timestamp": datetime.datetime.utcnow().isoformat()+"Z",
  "seed": seed,
  "selectedRegions": selected,
  "excludedRegions": [r["region"] for r in excluded],
  "policy": {
    "minRegions": min_regions,
    "maxRiskScore": max_risk,
    "rotationWindowHours": rotation_hours
  }
}

json.dump(result,open(out_path,"w"),indent=2)
PY
