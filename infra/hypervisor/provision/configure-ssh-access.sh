#!/usr/bin/env bash
# ==============================================================================
# GhostStack — configure-ssh-access.sh
# Run ON THE HYPERVISOR (as ghost user with sudo).
# Uses QEMU guest agent to inject devnet SSH key + sshd keepalive config
# into all running GhostStack VMs without needing pre-existing SSH access.
# ==============================================================================
set -uo pipefail

DEVKEY="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIF+osgEYoqPCDiJESBGJhdbM2EI+CcQr4UIC4igDX1Xu ghosttoken.dev@gmail.com"

ok()   { echo "[ssh-cfg] ✓ $*"; }
warn() { echo "[ssh-cfg] ⚠ $*"; }
log()  { echo "[ssh-cfg] $*"; }

# The script that runs INSIDE each VM (injected via guest agent)
INNER_SCRIPT=$(cat << 'INNER'
KEY="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIF+osgEYoqPCDiJESBGJhdbM2EI+CcQr4UIC4igDX1Xu ghosttoken.dev@gmail.com"

# Add to root
mkdir -p /root/.ssh && chmod 700 /root/.ssh
touch /root/.ssh/authorized_keys && chmod 600 /root/.ssh/authorized_keys
grep -qF "$KEY" /root/.ssh/authorized_keys || echo "$KEY" >> /root/.ssh/authorized_keys

# Add to every real user (uid>=1000)
for home in $(awk -F: '$3>=1000 && $7!~/nologin|false/{print $6}' /etc/passwd 2>/dev/null); do
  [ -d "$home" ] || continue
  usr=$(stat -c%U "$home" 2>/dev/null || continue)
  mkdir -p "$home/.ssh" && chmod 700 "$home/.ssh"
  touch "$home/.ssh/authorized_keys" && chmod 600 "$home/.ssh/authorized_keys"
  grep -qF "$KEY" "$home/.ssh/authorized_keys" || echo "$KEY" >> "$home/.ssh/authorized_keys"
  chown -R "$usr" "$home/.ssh"
done

# sshd keepalive — zero connection loss
mkdir -p /etc/ssh/sshd_config.d
cat > /etc/ssh/sshd_config.d/99-ghoststack.conf << SSHD
# GhostStack — unrestricted persistent SSH from ghostchain-devnet
ClientAliveInterval 30
ClientAliveCountMax 6
TCPKeepAlive yes
MaxSessions 50
AllowTcpForwarding yes
PermitRootLogin prohibit-password
PubkeyAuthentication yes
AuthorizedKeysFile .ssh/authorized_keys
UseDNS no
LoginGraceTime 120
MaxStartups 20:30:100
SSHD

systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || true
echo "OK:$(hostname)"
INNER
)

CMD_B64=$(printf '%s' "$INNER_SCRIPT" | base64 -w0)

inject_key() {
  local vm="$1"
  log "Configuring $vm ..."

  # Check VM is running
  if ! virsh domstate "$vm" 2>/dev/null | grep -q running; then
    warn "$vm: not running — skipped."
    return
  fi

  # Check guest agent responds
  if ! virsh qemu-agent-command "$vm" '{"execute":"guest-ping"}' >/dev/null 2>&1; then
    warn "$vm: guest agent not responding — skipped."
    return
  fi

  # Execute command inside the VM
  local exec_json
  exec_json=$(printf '{"execute":"guest-exec","arguments":{"path":"/bin/bash","arg":["-c","echo %s|base64 -d|bash"],"capture-output":true}}' "$CMD_B64")
  local result
  result=$(virsh qemu-agent-command "$vm" "$exec_json" 2>/dev/null) || { warn "$vm: exec failed."; return; }
  local pid
  pid=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin)['return']['pid'])" 2>/dev/null) || { warn "$vm: no PID."; return; }

  # Poll for completion (15s max)
  local status exited
  for i in $(seq 1 30); do
    sleep 0.5
    status=$(virsh qemu-agent-command "$vm" \
      "{\"execute\":\"guest-exec-status\",\"arguments\":{\"pid\":${pid}}}" 2>/dev/null) || continue
    exited=$(echo "$status" | python3 -c "import sys,json; print(json.load(sys.stdin)['return']['exited'])" 2>/dev/null)
    [[ "$exited" == "True" ]] && break
  done

  local exitcode out
  exitcode=$(echo "$status" | python3 -c "import sys,json; print(json.load(sys.stdin)['return'].get('exitcode',99))" 2>/dev/null)
  out=$(echo "$status" | python3 -c "
import sys,json,base64
d=json.load(sys.stdin)['return']
o=d.get('out-data','')
e=d.get('err-data','')
print((base64.b64decode(o).decode().strip() if o else '')+'  '+(base64.b64decode(e).decode().strip() if e else ''))" 2>/dev/null | tr '\n' ' ')

  if [[ "$exitcode" == "0" ]]; then
    ok "$vm: $out"
  else
    warn "$vm: exit=$exitcode  $out"
  fi
}

VMS=(
  ghost-dns-slave
  ghostchain-mainnet-l1
  ghostchain-testnet-l1
  ghost-mainnet-validator
  ghost-testnet-validator
  ghostl2-mainnet
  ghostl2-testnet
  ghostl3-mainnet
  ghostl3-testnet
)

for vm in "${VMS[@]}"; do
  inject_key "$vm"
done

echo ""
ok "Done. Now verify from ghostchain-devnet:"
echo "  ssh-keyscan 10.50.10.10 && ssh -J ghost@192.168.122.1 ubuntu@10.50.10.10 'hostname'"
