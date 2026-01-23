#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ATTEST=""
ZK=""
OUT_PATH=""
POLICY_PATH="$ROOT_DIR/ops/quorum/quorum-policy.json"
REGIONS_DIR="$ROOT_DIR/ops/quorum/regions"

usage() {
  cat <<'USAGE'
Usage: quorum-attest.sh --attestation <path> --zk <path> --out <path> [--policy <path>]
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --attestation) ATTEST="$2"; shift 2;;
    --zk) ZK="$2"; shift 2;;
    --out) OUT_PATH="$2"; shift 2;;
    --policy) POLICY_PATH="$2"; shift 2;;
    -h|--help) usage; exit 0;;
    *) echo "Unknown argument: $1" >&2; exit 1;;
  esac
done

if [[ -z "$ATTEST" || -z "$ZK" || -z "$OUT_PATH" ]]; then
  echo "Missing required arguments." >&2
  exit 1
fi

python3 - "$ATTEST" "$ZK" "$POLICY_PATH" "$REGIONS_DIR" "$OUT_PATH" <<'PY'
import base64,hashlib,json,os,subprocess,sys,datetime

attest=sys.argv[1]
zk=sys.argv[2]
policy_path=sys.argv[3]
regions_dir=sys.argv[4]
out_path=sys.argv[5]

policy=json.load(open(policy_path))
min_regions=int(policy.get("minRegions",3))
require_sig=bool(policy.get("requireSignature",True))
severity_on_failure=policy.get("severityOnFailure","CRITICAL")

def sha256(path):
    h=hashlib.sha256()
    with open(path,"rb") as f:
        h.update(f.read())
    return h.hexdigest()

attest_hash=sha256(attest)
zk_hash=sha256(zk)

regions=[]
valid=0
for name in sorted(os.listdir(regions_dir)):
    if not name.endswith(".json"):
        continue
    path=os.path.join(regions_dir,name)
    data=json.load(open(path))
    region=data.get("region") or name.replace(".json","")
    status="valid"
    issues=[]
    if data.get("attestationHash") != attest_hash:
        status="invalid"
        issues.append("attestation_hash_mismatch")
    if data.get("zkHash") != zk_hash:
        status="invalid"
        issues.append("zk_hash_mismatch")
    sig=data.get("signature")
    pub=data.get("publicKeyPem")
    if require_sig:
        if not sig or not pub:
            status="invalid"
            issues.append("missing_signature")
        else:
            message=f"{attest_hash}:{zk_hash}".encode()
            sig_bytes=base64.b64decode(sig)
            verify_ok=False
            try:
                tmp_sig=os.path.join(regions_dir,".tmp.sig")
                tmp_pub=os.path.join(regions_dir,".tmp.pub")
                with open(tmp_sig,"wb") as f:
                    f.write(sig_bytes)
                with open(tmp_pub,"w") as f:
                    f.write(pub)
                result=subprocess.run(
                    ["openssl","dgst","-sha256","-verify",tmp_pub,"-signature",tmp_sig],
                    input=message,
                    capture_output=True,
                    check=False
                )
                verify_ok=result.returncode==0
            finally:
                for tmp in (tmp_sig,tmp_pub):
                    try:
                        os.remove(tmp)
                    except Exception:
                        pass
            if not verify_ok:
                status="invalid"
                issues.append("signature_invalid")
    if status=="valid":
        valid+=1
    regions.append({
        "region": region,
        "status": status,
        "issues": issues
    })

status="satisfied" if valid >= min_regions else "failed"
severity="INFO"
if status!="satisfied":
    severity=severity_on_failure

payload={
  "timestamp": datetime.datetime.utcnow().isoformat()+"Z",
  "attestationHash": attest_hash,
  "zkHash": zk_hash,
  "requiredRegions": min_regions,
  "validRegions": valid,
  "status": status,
  "severity": severity,
  "regions": regions
}

json.dump(payload,open(out_path,"w"),indent=2)
PY
