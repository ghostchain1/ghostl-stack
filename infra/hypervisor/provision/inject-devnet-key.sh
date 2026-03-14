#!/usr/bin/env bash
# inject-devnet-key.sh — Inject ghost user SSH key into all remote VMs.
#
# Can run from:
#   • the KVM hypervisor  — uses virsh qemu-guest-agent (works before SSH is up)
#   • ghostchain-devnet   — falls back to SSH-based injection (requires cloud-init
#                           to have already placed an accepted key on each VM)
#
# ghostchain-devnet is NEVER a target — it is the controller node.
set -euo pipefail

# Shared inventory: REMOTE_VMS (excludes ghostchain-devnet) and vm_ip().
# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/inventory.sh"

log() { echo "[inject-key] $(date -u +%H:%M:%SZ) $*"; }

PUBKEY_FILE="${PUBKEY_FILE:-$HOME/.ssh/id_ed25519.pub}"
[ -f "$PUBKEY_FILE" ] || { log "ERROR: public key not found: $PUBKEY_FILE"; exit 1; }
PUBKEY=$(cat "$PUBKEY_FILE")

SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=8 -o BatchMode=yes"

# ── Mode A: virsh qemu-guest-agent (hypervisor) ───────────────────────────────
agent_ping() {
  virsh qemu-agent-command "$1" '{"execute":"guest-ping"}' 2>/dev/null | grep -q '"return"'
}

build_inject_cmd() {
  python3 - <<'PYEOF'
import json, sys
key = open(sys.argv[1]).read().strip()
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
  "$PUBKEY_FILE"
}

inject_via_agent() {
  local vm="$1"
  local cmd pid_json
  cmd=$(build_inject_cmd)
  pid_json=$(virsh qemu-agent-command "$vm" "$cmd" 2>/dev/null || echo "")
  if echo "$pid_json" | grep -q '"pid"'; then
    echo "  $vm - key injected (agent)"
  else
    echo "  $vm - guest-exec failed, will retry"
    return 1
  fi
}

run_agent_mode() {
  declare -A VM_DONE
  for vm in "${REMOTE_VMS[@]}"; do VM_DONE["$vm"]=0; done

  local MAX_WAIT=600 START
  START=$(date +%s)

  log "Injecting key via qemu-guest-agent (hypervisor mode)..."
  log "Key: $(cut -c1-60 "$PUBKEY_FILE")..."
  echo ""

  while true; do
    local all_done=1
    for vm in "${REMOTE_VMS[@]}"; do
      [ "${VM_DONE[$vm]}" = "1" ] && continue
      all_done=0
      if agent_ping "$vm" 2>/dev/null; then
        if inject_via_agent "$vm"; then
          VM_DONE[$vm]=1
        fi
      else
        log "  $vm - agent not ready yet"
      fi
    done

    [ "$all_done" = "1" ] && break

    local elapsed=$(( $(date +%s) - START ))
    if [ "$elapsed" -gt "$MAX_WAIT" ]; then
      log "Timeout after ${MAX_WAIT}s. Not done:"
      for vm in "${REMOTE_VMS[@]}"; do
        [ "${VM_DONE[$vm]}" = "0" ] && log "  FAILED: $vm"
      done
      break
    fi
    sleep 15
  done
}

# ── Mode B: SSH-based injection (running from ghostchain-devnet) ───────────────
inject_via_ssh() {
  local vm="$1" ip="$2"
  local inject_script
  inject_script=$(
    printf 'K=%s; mkdir -p /home/ghost/.ssh /root/.ssh && '\
'printf "%%s\\n" "$K" >> /home/ghost/.ssh/authorized_keys && '\
'printf "%%s\\n" "$K" >> /root/.ssh/authorized_keys && '\
'sort -u /home/ghost/.ssh/authorized_keys -o /home/ghost/.ssh/authorized_keys && '\
'sort -u /root/.ssh/authorized_keys -o /root/.ssh/authorized_keys && '\
'chmod 700 /home/ghost/.ssh /root/.ssh && '\
'chmod 600 /home/ghost/.ssh/authorized_keys /root/.ssh/authorized_keys && '\
'chown -R ghost:ghost /home/ghost/.ssh 2>/dev/null || true && echo DONE' \
"$PUBKEY"
  )
  local result
  result=$(ssh $SSH_OPTS ghost@"$ip" "$inject_script" 2>/dev/null || echo "FAIL")
  if [ "$result" = "DONE" ]; then
    echo "  $vm ($ip) - key injected (ssh)"
  else
    echo "  $vm ($ip) - FAILED (ssh): $result" >&2
    return 1
  fi
}

run_ssh_mode() {
  log "virsh not found — using SSH-based injection (devnet mode)."
  log "NOTE: Requires cloud-init to have already granted SSH access to each VM."
  log "Key: $(cut -c1-60 "$PUBKEY_FILE")..."
  echo ""
  local ok=0 fail=0
  for vm in "${REMOTE_VMS[@]}"; do
    local ip; ip=$(vm_ip "$vm")
    if inject_via_ssh "$vm" "$ip"; then
      (( ok++ )) || true
    else
      (( fail++ )) || true
    fi
  done
  echo ""
  log "SSH injection done — ok=$ok fail=$fail"
}

# ── Dispatch ──────────────────────────────────────────────────────────────────
if command -v virsh &>/dev/null; then
  run_agent_mode
else
  run_ssh_mode
fi

# ── Final SSH connectivity test ───────────────────────────────────────────────
echo ""
log "Testing SSH as ghost@<ip>..."
echo ""
for vm in "${REMOTE_VMS[@]}"; do
  ip="$(vm_ip "$vm")"
  result=$(ssh $SSH_OPTS ghost@"$ip" "echo OK" 2>/dev/null || echo "FAIL")
  printf "  %-30s %-16s %s\n" "$vm" "$ip" "$result"
done
