#!/usr/bin/env bash
set -Eeuo pipefail

OUT_PATH=""

usage() {
  cat <<'USAGE'
Usage: collect-cca.sh --out <path>
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --out) OUT_PATH="$2"; shift 2;;
    -h|--help) usage; exit 0;;
    *) echo "Unknown argument: $1" >&2; exit 1;;
  esac
done

if [[ -z "$OUT_PATH" ]]; then
  echo "Missing --out" >&2
  exit 1
fi

SEV_MODE="none"
TDX_MODE="none"
VENDOR="unknown"
SUPPORTED="false"
REASON="capability_not_detected"

if [[ -f /sys/module/kvm_amd/parameters/sev ]]; then
  SEV_VAL=$(cat /sys/module/kvm_amd/parameters/sev)
  if [[ "$SEV_VAL" != "0" ]]; then
    SUPPORTED="true"
    VENDOR="AMD"
    SEV_MODE="SEV"
    if [[ -f /sys/module/kvm_amd/parameters/sev_es && "$(cat /sys/module/kvm_amd/parameters/sev_es)" != "0" ]]; then
      SEV_MODE="SEV-ES"
    fi
  fi
fi

if [[ -f /sys/module/kvm_intel/parameters/tdx ]]; then
  TDX_VAL=$(cat /sys/module/kvm_intel/parameters/tdx)
  if [[ "$TDX_VAL" != "0" ]]; then
    SUPPORTED="true"
    VENDOR="Intel"
    TDX_MODE="TDX"
  fi
fi

if [[ "$SUPPORTED" == "true" ]]; then
  REASON=""
fi

python3 - "$OUT_PATH" "$SUPPORTED" "$VENDOR" "$SEV_MODE" "$TDX_MODE" "$REASON" <<'PY'
import hashlib,json,sys,datetime

out_path=sys.argv[1]
supported=sys.argv[2]=="true"
vendor=sys.argv[3]
sev_mode=sys.argv[4]
tdx_mode=sys.argv[5]
reason=sys.argv[6]

payload={
  "timestamp": datetime.datetime.utcnow().isoformat()+"Z",
  "supported": supported,
  "vendor": vendor,
  "sevMode": sev_mode,
  "tdxMode": tdx_mode,
  "reason": reason,
  "attestationType": "capability-scan"
}

measurement=f"{vendor}|{sev_mode}|{tdx_mode}|{supported}".encode()
payload["measurementHash"]=hashlib.sha256(measurement).hexdigest()

json.dump(payload,open(out_path,"w"),indent=2)
PY
