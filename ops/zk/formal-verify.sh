#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IMMUTABILITY_INPUT=""
RECURSIVE_INPUT=""
OUT_PATH=""
BUILD_DIR="$ROOT_DIR/ops/zk/formal"

usage() {
  cat <<'USAGE'
Usage: formal-verify.sh --immutability-input <path> --recursive-input <path> --out <path>
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --immutability-input) IMMUTABILITY_INPUT="$2"; shift 2;;
    --recursive-input) RECURSIVE_INPUT="$2"; shift 2;;
    --out) OUT_PATH="$2"; shift 2;;
    -h|--help) usage; exit 0;;
    *) echo "Unknown argument: $1" >&2; exit 1;;
  esac
done

if [[ -z "$IMMUTABILITY_INPUT" || -z "$RECURSIVE_INPUT" || -z "$OUT_PATH" ]]; then
  echo "Missing required arguments." >&2
  exit 1
fi

if ! command -v circom >/dev/null 2>&1; then
  echo "circom is required for formal verification." >&2
  exit 1
fi

if ! command -v snarkjs >/dev/null 2>&1; then
  echo "snarkjs is required for formal verification." >&2
  exit 1
fi

mkdir -p "$BUILD_DIR"

python3 - "$ROOT_DIR" "$IMMUTABILITY_INPUT" "$RECURSIVE_INPUT" "$OUT_PATH" "$BUILD_DIR" <<'PY'
import json,os,subprocess,sys,re,datetime

root=sys.argv[1]
immutability_input=sys.argv[2]
recursive_input=sys.argv[3]
out_path=sys.argv[4]
build_dir=sys.argv[5]

circuits=[
    {
        "name":"immutability",
        "path": os.path.join(root,"ops/zk/circuit/immutability.circom"),
        "input": immutability_input
    },
    {
        "name":"recursive",
        "path": os.path.join(root,"ops/zk/circuit/recursive_aggregate.circom"),
        "input": recursive_input
    }
]

results=[]
overall="PASS"

for circuit in circuits:
    name=circuit["name"]
    path=circuit["path"]
    input_path=circuit["input"]
    work=os.path.join(build_dir,name)
    os.makedirs(work,exist_ok=True)
    if not os.path.isfile(path):
        results.append({"circuit":name,"status":"FAIL","reason":"missing_circuit"})
        overall="FAIL"
        continue
    compile_cmd=["circom",path,"--r1cs","--wasm","--sym","-o",work]
    if subprocess.call(compile_cmd)!=0:
        results.append({"circuit":name,"status":"FAIL","reason":"compile_failed"})
        overall="FAIL"
        continue
    r1cs=os.path.join(work,f"{name}.r1cs") if name!="recursive" else os.path.join(work,"recursive_aggregate.r1cs")
    wasm_dir=os.path.join(work,f"{name}_js") if name!="recursive" else os.path.join(work,"recursive_aggregate_js")
    witness=os.path.join(work,"witness.wtns")
    info_output=subprocess.check_output(["snarkjs","r1cs","info",r1cs],text=True)
    match=re.search(r"Constraints:\s+(\d+)",info_output)
    constraints=int(match.group(1)) if match else 0
    if constraints<=0:
        results.append({"circuit":name,"status":"FAIL","reason":"no_constraints"})
        overall="FAIL"
        continue
    if not os.path.isfile(input_path):
        results.append({"circuit":name,"status":"FAIL","reason":"missing_input"})
        overall="FAIL"
        continue
    gen_witness=os.path.join(wasm_dir,"generate_witness.js")
    if subprocess.call(["node",gen_witness,input_path,witness])!=0:
        results.append({"circuit":name,"status":"FAIL","reason":"witness_failed"})
        overall="FAIL"
        continue
    if subprocess.call(["snarkjs","wtns","check",r1cs,witness])!=0:
        results.append({"circuit":name,"status":"FAIL","reason":"witness_check_failed"})
        overall="FAIL"
        continue
    results.append({"circuit":name,"status":"PASS","constraints":constraints})

report={
  "timestamp": datetime.datetime.utcnow().isoformat()+"Z",
  "overallStatus": overall,
  "checks": results
}
json.dump(report,open(out_path,"w"),indent=2)
if overall!="PASS":
    raise SystemExit("Formal verification failed")
PY
