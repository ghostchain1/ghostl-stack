#!/usr/bin/env bash
# inject-devnet-key.sh — Wait for qemu-guest-agent then inject ghost user SSH key
set -euo pipefail

VMS=(
  ghost-dns-slave
  ghostchain-testnet-l1
  ghost-testnet-validator
  ghostl2-testnet
  ghostl3-testnet
  ghostchain-mainnet-l1
  ghost-mainnet-validator
  ghostl2-mainnet
  ghostl3-mainnet
)

declare -A VM_IP=(
  [ghost-dns-slave]="10.50.99.66"
  [ghostchain-testnet-l1]="10.50.99.71"
  [ghost-testnet-validator]="10.50.99.73"
  [ghostl2-testnet]="10.50.99.77"
  [ghostl3-testnet]="10.50.99.79"
  [ghostchain-mainnet-l1]="10.50.99.70"
  [ghost-mainnet-validator]="10.50.99.72"
  [ghostl2-mainnet]="10.50.99.76"
  [ghostl3-mainnet]="10.50.99.78"
)

log() { echo "[inject-key] $(date -u +%H:%M:%SZ) $*"; }

agent_ping() {
  virsh qemu-agent-command "$1" '{"execute":"guest-ping"}' 2>/dev/null | grep -q '"return"'
}

build_inject_cmd() {
  python3 - <<'PYEOF'
import json
key = open('/home/ghost/.ssh/id_ed25519.pub').read().strip()
script = (
  'mkdir -p /home/ghost/.ssh /root/.ssh && '
  'echo ' + json.dumps(key) + ' >> /home/ghost/.ssh/authorized_keys && '
  'echo ' + json.dumps(key) + ' >> /root/.ssh/authorized_keys && '
  'sort -u /home/ghost/.ssh/authorized_keys -o /home/ghost/.ssh/authorized_keys && '
  'sort -u /root/.ssh/authorized_keys -o /root/.ssh/authorized_keys && '
  'chmod 700 /home/ghost/.ssh /root/.ssh && '
  'chmod 600 /home/ghost/.ssh/authorized_keys /root/.ssh/authorized_keys && '
  'chown -R ghost:ghost /home/ghost/.ssh || true && '
  'echo DONE'
)
obj = {
  'execute': 'guest-exec',
  'arguments': {'path': '/bin/bash', 'arg': ['-c', script], 'capture-output': True}
}
print(json.dumps(obj))
PYEOF
}

inject_key() {
  local vm="$1"
  local cmd pid_json
  cmd=$(build_inject_cmd)
  pid_json=$(virsh qemu-agent-command "$vm" "$cmd" 2>/dev/null || echo "")
  if echo "$pid_json" | grep -q '"pid"'; then
    echo "  $vm - key injected"
  else
    echo "  $vm - guest-exec failed, will retry"
    return 1
  fi
}

declare -A VM_DONE
for vm in "${VMS[@]}"; do
  VM_DONE["$vm"]=0
done

MAX_WAIT=600
START=$(date +%s)

log "Injecting ghost SSH key into all VMs via qemu-guest-agent..."
log "Key: $(cat /home/ghost/.ssh/id_ed25519.pub | cut -c1-60)..."
echo ""

while true; do
  all_done=1
  for vm in "${VMS[@]}"; do
    [ "${VM_DONE[$vm]}" = "1" ] && continue
    all_done=0
    if agent_ping "$vm" 2>/dev/null; then
      if inject_key "$vm"; then
        VM_DONE[$vm]=1
      fi
    else
      log "  $vm - agent not ready yet"
    fi
  done

  [ "$all_done" = "1" ] && break

  elapsed=$(( $(date +%s) - START ))
  if [ "$elapsed" -gt "$MAX_WAIT" ]; then
    log "Timeout after ${MAX_WAIT}s. Not done:"
    for vm in "${VMS[@]}"; do
      [ "${VM_DONE[$vm]}" = "0" ] && log "  FAILED: $vm"
    done
    break
  fi

  sleep 15
done

echo ""
log "Testing SSH as ghost@<ip>..."
echo ""

SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=8 -o BatchMode=yes"
for vm in "${VMS[@]}"; do
  ip="${VM_IP[$vm]}"
  result=$(ssh $SSH_OPTS ghost@"$ip" "echo OK" 2>/dev/null || echo "FAIL")
  printf "  %-30s %-16s %s\n" "$vm" "$ip" "$result"
done
