#!/usr/bin/env bash
set -Eeuo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

require_cmd docker
require_cmd python3
require_cmd bash

for f in "${STACK_COMPOSE_FILES[@]}"; do
  [[ -f "$ROOT_DIR/$f" ]] || { echo "[preflight] missing compose file: $f" >&2; exit 1; }
done

for f in .env.l1.testnet.example .env.l2.testnet.example .env.l3.testnet.example .env.ui.testnet.example; do
  [[ -f "$ROOT_DIR/$f" ]] || { echo "[preflight] missing env template: $f" >&2; exit 1; }
done

compose_cmd config > "$ARTIFACT_DIR/compose.resolved.yml"

python3 - "$ARTIFACT_DIR/compose.resolved.yml" <<'PY'
import sys,yaml
path=sys.argv[1]
cfg=yaml.safe_load(open(path)) or {}
services=cfg.get('services',{})

required=['l2-geth','l3-geth','op-node','op-batcher','op-proposer','l3-op-node','l3-op-batcher','l3-op-proposer']
for s in required:
    if s not in services:
        print(f"[preflight] missing required service: {s}",file=sys.stderr)
        sys.exit(1)

def service_text(svc):
    c=svc.get('command','')
    if isinstance(c,list): c=' '.join(map(str,c))
    e=svc.get('environment',{})
    if isinstance(e,dict): e=' '.join(f"{k}={v}" for k,v in e.items())
    elif isinstance(e,list): e=' '.join(map(str,e))
    else: e=''
    return (str(c)+' '+str(e)).lower()

# enforce no L3->L1 direct by config text and network segmentation
for name in ['l3-op-node','l3-op-batcher','l3-op-proposer','l3-op-challenger']:
    if name not in services:
        continue
    txt=service_text(services[name])
    banned=['l1-rpc-proxy','op-gate-l1',':18545','host.docker.internal:18545']
    for b in banned:
        if b in txt:
            print(f"[preflight] routing violation: {name} references {b}",file=sys.stderr)
            sys.exit(1)
    nets=services[name].get('networks',[])
    if isinstance(nets,dict):
        nets=list(nets.keys())
    if 'l1_net' in nets:
        print(f"[preflight] routing violation: {name} attached to l1_net",file=sys.stderr)
        sys.exit(1)

# enforce L2 settlement through L1 proxy/gate only
for name in ['op-batcher','op-proposer']:
    txt=service_text(services[name])
    if ('op-gate-l1' not in txt) and ('l1-rpc-proxy' not in txt):
        print(f"[preflight] settlement path violation: {name} missing op-gate-l1/l1-rpc-proxy",file=sys.stderr)
        sys.exit(1)

print('[preflight] routing-law static checks passed')
PY

# Routing proof script (runtime-aware but tolerates offline RPCs)
RPC_L1="${RPC_L1:-http://localhost:18545}" \
RPC_L2="${RPC_L2:-http://localhost:29547}" \
RPC_L3="${RPC_L3:-http://localhost:39545}" \
L3_PARENT_L2_RPC="${L3_PARENT_L2_RPC:-http://localhost:29547}" \
bash "$ROOT_DIR/scripts/verify-routing.sh"

if [[ "${STRICT_SECRETS:-1}" == "1" ]]; then
  bash "$ROOT_DIR/scripts/security/secret-scan.sh"
fi

echo "[preflight] PASS"
