#!/usr/bin/env bash
# ==============================================================================
# GhostStack — configure-vm-ssh.sh
# Run on the HYPERVISOR (as ghost with sudo).
# Injects devnet SSH key + static IP + sshd keepalive into every VM via
# QEMU guest agent — no pre-existing SSH access to VMs required.
# ==============================================================================
set -euo pipefail

DEVKEY="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIF+osgEYoqPCDiJESBGJhdbM2EI+CcQr4UIC4igDX1Xu ghosttoken.dev@gmail.com"

log()  { echo -e "[vm-ssh] $(date '+%H:%M:%S')  $*"; }
ok()   { echo -e "[vm-ssh] \033[32m✓ $*\033[0m"; }
warn() { echo -e "[vm-ssh] \033[33m⚠ $*\033[0m"; }

# ── 1. Fix archive-node memory (64GiB → 16GiB) and start it ──────────────────
log "Fixing ghost-mainnet-archive-node memory..."
sudo virsh setmaxmem ghost-mainnet-archive-node 16777216 --config 2>/dev/null || true
sudo virsh setmem    ghost-mainnet-archive-node 16777216 --config 2>/dev/null || true
sudo virsh setvcpus  ghost-mainnet-archive-node 4 --config --maximum 2>/dev/null || true
sudo virsh setvcpus  ghost-mainnet-archive-node 4 --config 2>/dev/null || true
if sudo virsh domstate ghost-mainnet-archive-node 2>/dev/null | grep -q "shut off"; then
  sudo virsh start ghost-mainnet-archive-node && ok "archive-node started" || warn "archive-node start failed"
  sleep 15  # give it time to boot before injecting
else
  log "archive-node already running"
fi

# ── 2. The script to run INSIDE each VM ───────────────────────────────────────
# Written to a temp file so we can base64-encode it cleanly
INNER_SCRIPT=$(mktemp)
cat > "$INNER_SCRIPT" << 'INNER'
#!/bin/bash
set -e
KEY="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIF+osgEYoqPCDiJESBGJhdbM2EI+CcQr4UIC4igDX1Xu ghosttoken.dev@gmail.com"

# Add to root
mkdir -p /root/.ssh && chmod 700 /root/.ssh
touch /root/.ssh/authorized_keys && chmod 600 /root/.ssh/authorized_keys
grep -qF "$KEY" /root/.ssh/authorized_keys || echo "$KEY" >> /root/.ssh/authorized_keys

# Add to all regular users
for home in $(awk -F: '$3>=1000 && $7!~/nologin|false/{print $6}' /etc/passwd 2>/dev/null); do
  [ -d "$home" ] || continue
  mkdir -p "$home/.ssh" && chmod 700 "$home/.ssh"
  touch "$home/.ssh/authorized_keys" && chmod 600 "$home/.ssh/authorized_keys"
  grep -qF "$KEY" "$home/.ssh/authorized_keys" || echo "$KEY" >> "$home/.ssh/authorized_keys"
  owner=$(stat -c%U "$home" 2>/dev/null || echo root)
  chown -R "$owner" "$home/.ssh" 2>/dev/null || true
done

# Zero-drop sshd config
mkdir -p /etc/ssh/sshd_config.d
cat > /etc/ssh/sshd_config.d/99-ghoststack.conf << 'SSHD'
ClientAliveInterval 20
ClientAliveCountMax 9
TCPKeepAlive yes
MaxSessions 50
AllowTcpForwarding yes
PermitRootLogin prohibit-password
PubkeyAuthentication yes
AuthorizedKeysFile .ssh/authorized_keys
UseDNS no
SSHD

# Apply static IP via netplan — freeze current address so reboots keep same IP
IFACE=$(ip route show default 2>/dev/null | awk '{print $5; exit}')
CURRENT_IP=$(ip -4 addr show "$IFACE" 2>/dev/null | awk '/inet /{print $2; exit}')
GW=$(ip route show default 2>/dev/null | awk '/default/{print $3; exit}')
DNS="8.8.8.8"

if [[ -n "$IFACE" && -n "$CURRENT_IP" && -n "$GW" ]]; then
  cat > /etc/netplan/99-ghoststack-static.yaml << NETPLAN
network:
  version: 2
  ethernets:
    ${IFACE}:
      dhcp4: false
      addresses: [${CURRENT_IP}]
      routes:
        - to: default
          via: ${GW}
      nameservers:
        addresses: [${DNS}, 1.1.1.1]
NETPLAN
  chmod 600 /etc/netplan/99-ghoststack-static.yaml
  netplan generate 2>/dev/null || true
fi

systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || true
echo "OK ip=$(hostname -I | awk '{print $1}') host=$(hostname)"
INNER

CMD_B64=$(base64 -w0 < "$INNER_SCRIPT")
rm -f "$INNER_SCRIPT"

# ── 3. Inject into each VM via guest agent ────────────────────────────────────
inject_vm() {
  local vm="$1"
  echo -n "  $vm: "

  if ! sudo virsh domstate "$vm" 2>/dev/null | grep -q running; then
    echo "not running — skip"
    return
  fi

  # Launch command inside VM
  RES=$(sudo virsh qemu-agent-command "$vm" \
    "{\"execute\":\"guest-exec\",\"arguments\":{\"path\":\"/bin/bash\",\"arg\":[\"-c\",\"echo ${CMD_B64}|base64 -d|bash\"],\"capture-output\":true}}" 2>/dev/null) || {
      echo "guest-agent command failed"
      return
    }

  PID=$(echo "$RES" | python3 -c "import sys,json; print(json.load(sys.stdin)['return']['pid'])" 2>/dev/null)
  [[ -z "$PID" ]] && { echo "could not get PID"; return; }

  # Poll for completion (max 20s)
  ST=""
  for i in $(seq 1 40); do
    sleep 0.5
    ST=$(sudo virsh qemu-agent-command "$vm" \
      "{\"execute\":\"guest-exec-status\",\"arguments\":{\"pid\":${PID}}}" 2>/dev/null) || continue
    DONE=$(echo "$ST" | python3 -c "import sys,json; print(json.load(sys.stdin)['return']['exited'])" 2>/dev/null)
    [[ "$DONE" == "True" ]] && break
  done

  python3 - "$vm" << PYEOF
import sys, json, base64
vm = sys.argv[1]
try:
    d = json.loads("""${ST}""")['return']
    ec = d.get('exitcode', 99)
    out = base64.b64decode(d.get('out-data', '')).decode().strip() if d.get('out-data') else ''
    err = base64.b64decode(d.get('err-data', '')).decode().strip()[:100] if d.get('err-data') else ''
    print(f"exit={ec} {out}" + (f" ERR:{err}" if err else ""))
except Exception as e:
    print(f"parse error: {e}")
PYEOF
}

ALL_VMS=(
  ghostchain-mainnet-l1
  ghostchain-testnet-l1
  ghost-mainnet-validator
  ghost-testnet-validator
  ghost-mainnet-archive-node
  ghostl2-mainnet
  ghostl2-testnet
  ghostl3-mainnet
  ghostl3-testnet
  ghost-dns-slave
)

log "Injecting SSH key + static IP + sshd config into all VMs..."
for vm in "${ALL_VMS[@]}"; do
  inject_vm "$vm"
done

# ── 4. Print final IP table ───────────────────────────────────────────────────
echo ""
log "Final VM state:"
printf "  %-35s %-12s %s\n" "VM" "STATE" "IP"
printf "  %-35s %-12s %s\n" "--" "-----" "--"
for vm in "${ALL_VMS[@]}"; do
  state=$(sudo virsh domstate "$vm" 2>/dev/null | tr -d '\n')
  ip=$(sudo virsh domifaddr "$vm" 2>/dev/null | grep -Eo "([0-9]{1,3}\.){3}[0-9]{1,3}" | head -1 || echo "")
  # Fallback: ask guest agent
  if [[ -z "$ip" ]] && sudo virsh domstate "$vm" 2>/dev/null | grep -q running; then
    ip=$(sudo virsh qemu-agent-command "$vm" \
      '{"execute":"guest-exec","arguments":{"path":"/bin/hostname","arg":["-I"],"capture-output":true}}' 2>/dev/null \
      | python3 -c "
import sys,json,base64
try:
  d=json.loads(sys.stdin.read())
  pid=d['return']['pid']
  import subprocess, time
  time.sleep(0.8)
except: pass
" 2>/dev/null || echo "")
  fi
  printf "  %-35s %-12s %s\n" "$vm" "$state" "${ip:-no-ip}"
done
