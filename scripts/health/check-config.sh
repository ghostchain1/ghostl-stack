#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CANONICAL="$ROOT_DIR/ops/STACK_CANONICAL.yml"

if [[ ! -f "$CANONICAL" ]]; then
  echo "Missing canonical config: $CANONICAL"
  exit 1
fi

python3 - "$CANONICAL" <<'PY'
import json,sys
path=sys.argv[1]
data=json.load(open(path))
chains=data.get("chains",{})
required=["l1","l2","l3"]
missing=[k for k in required if k not in chains]
if missing:
    print("Missing chain entries:", ",".join(missing))
    raise SystemExit(1)
for key in required:
    entry=chains.get(key,{})
    if not entry.get("rpcHttp"):
        print(f"{key}: rpcHttp missing")
        raise SystemExit(1)
print("Config OK: chain RPC endpoints present.")
PY
