#!/usr/bin/env bash
# ==============================================================================
# GhostStack — provision-all-vms.sh
# Hypervisor-side dispatch: registers static DHCP leases, then SSH-provisions
# all 10 GhostStack VMs (already created in libvirt) in strict layer order.
#
# Routing law (enforced by nftables + this script's start order):
#   L3 → L2 → L1   ✅
#   L3 → L1 direct ❌  FORBIDDEN
#
# Prerequisites on the hypervisor:
#   - libvirt / virsh installed
#   - All VMs listed in `virsh list --all`
#   - SSH key in $VM_SSH_KEY accessible to root
#   - config/ghoststack.env populated (no REPLACE_ME)
#
# Usage (as root on the hypervisor):
#   cd /home/ghost/ghostl-stack
#   sudo bash infra/hypervisor/provision/provision-all-vms.sh [--dry-run]
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
CONF_FILE="${SCRIPT_DIR}/../config/ghoststack.env"
LOG_DIR="${SCRIPT_DIR}/../logs"
mkdir -p "$LOG_DIR"
LOGFILE="${LOG_DIR}/provision-all-$(date +%Y%m%d-%H%M%S).log"

exec > >(tee -a "$LOGFILE") 2>&1

# ── Helpers ──────────────────────────────────────────────────────────────────
log()  { echo -e "[provision] $(date '+%H:%M:%S')  $*"; }
info() { echo -e "[provision] \033[36m$*\033[0m"; }
ok()   { echo -e "[provision] \033[32m✓ $*\033[0m"; }
warn() { echo -e "[provision] \033[33m⚠ $*\033[0m"; }
die()  { echo -e "[provision] \033[31mERROR: $*\033[0m" >&2; exit 1; }

DRY_RUN_ARG=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN_ARG=true

# ── Load env ─────────────────────────────────────────────────────────────────
[[ -f "$CONF_FILE" ]] || die "Config not found: $CONF_FILE"
# shellcheck disable=SC1090
source "$CONF_FILE"
ok "Config loaded: $CONF_FILE"

DRY_RUN="${DRY_RUN_ARG:-${DRY_RUN:-false}}"

SSH_OPTS=(
  -o StrictHostKeyChecking=accept-new
  -o ConnectTimeout=15
  -o BatchMode=yes
  -o ForwardAgent=yes
  -i "${VM_SSH_KEY:-/root/.ssh/id_ed25519}"
)
SSH_USER="${VM_SSH_USER:-ghost}"

# ── VM catalogue ─────────────────────────────────────────────────────────────
declare -A VM_IP VM_GW VM_NET VM_PROVISION VM_ARG

# L1 segment
VM_IP["$VM_L1_MAINNET"]="$IP_L1_MAINNET";           VM_GW["$VM_L1_MAINNET"]="$GS_L1_GW"
VM_NET["$VM_L1_MAINNET"]="$GS_NET_L1"
VM_PROVISION["$VM_L1_MAINNET"]="infra/hypervisor/provision/ghostchain-l1-provision.sh"
VM_ARG["$VM_L1_MAINNET"]="mainnet"

VM_IP["$VM_L1_TESTNET"]="$IP_L1_TESTNET";           VM_GW["$VM_L1_TESTNET"]="$GS_L1_GW"
VM_NET["$VM_L1_TESTNET"]="$GS_NET_L1"
VM_PROVISION["$VM_L1_TESTNET"]="infra/hypervisor/provision/ghostchain-l1-provision.sh"
VM_ARG["$VM_L1_TESTNET"]="testnet"

VM_IP["$VM_L1_VALIDATOR_MAINNET"]="$IP_L1_VALIDATOR_MAINNET"; VM_GW["$VM_L1_VALIDATOR_MAINNET"]="$GS_L1_GW"
VM_NET["$VM_L1_VALIDATOR_MAINNET"]="$GS_NET_L1"
VM_PROVISION["$VM_L1_VALIDATOR_MAINNET"]="infra/hypervisor/provision/ghost-validator-provision.sh"
VM_ARG["$VM_L1_VALIDATOR_MAINNET"]="mainnet"

VM_IP["$VM_L1_VALIDATOR_TESTNET"]="$IP_L1_VALIDATOR_TESTNET"; VM_GW["$VM_L1_VALIDATOR_TESTNET"]="$GS_L1_GW"
VM_NET["$VM_L1_VALIDATOR_TESTNET"]="$GS_NET_L1"
VM_PROVISION["$VM_L1_VALIDATOR_TESTNET"]="infra/hypervisor/provision/ghost-validator-provision.sh"
VM_ARG["$VM_L1_VALIDATOR_TESTNET"]="testnet"

VM_IP["$VM_L1_ARCHIVE"]="$IP_L1_ARCHIVE";           VM_GW["$VM_L1_ARCHIVE"]="$GS_L1_GW"
VM_NET["$VM_L1_ARCHIVE"]="$GS_NET_L1"
VM_PROVISION["$VM_L1_ARCHIVE"]="infra/hypervisor/provision/ghost-archive-provision.sh"
VM_ARG["$VM_L1_ARCHIVE"]="mainnet"

# L2 segment
VM_IP["$VM_L2_MAINNET"]="$IP_L2_MAINNET";           VM_GW["$VM_L2_MAINNET"]="$GS_L2_GW"
VM_NET["$VM_L2_MAINNET"]="$GS_NET_L2"
VM_PROVISION["$VM_L2_MAINNET"]="infra/hypervisor/provision/ghostl2-provision.sh"
VM_ARG["$VM_L2_MAINNET"]="mainnet"

VM_IP["$VM_L2_TESTNET"]="$IP_L2_TESTNET";           VM_GW["$VM_L2_TESTNET"]="$GS_L2_GW"
VM_NET["$VM_L2_TESTNET"]="$GS_NET_L2"
VM_PROVISION["$VM_L2_TESTNET"]="infra/hypervisor/provision/ghostl2-provision.sh"
VM_ARG["$VM_L2_TESTNET"]="testnet"

# L3 segment
VM_IP["$VM_L3_MAINNET"]="$IP_L3_MAINNET";           VM_GW["$VM_L3_MAINNET"]="$GS_L3_GW"
VM_NET["$VM_L3_MAINNET"]="$GS_NET_L3"
VM_PROVISION["$VM_L3_MAINNET"]="infra/hypervisor/provision/ghostl3-provision.sh"
VM_ARG["$VM_L3_MAINNET"]="mainnet"

VM_IP["$VM_L3_TESTNET"]="$IP_L3_TESTNET";           VM_GW["$VM_L3_TESTNET"]="$GS_L3_GW"
VM_NET["$VM_L3_TESTNET"]="$GS_NET_L3"
VM_PROVISION["$VM_L3_TESTNET"]="infra/hypervisor/provision/ghostl3-provision.sh"
VM_ARG["$VM_L3_TESTNET"]="testnet"

# MGMT segment
VM_IP["$VM_VHDX_IMPORT"]="$IP_VHDX_IMPORT";         VM_GW["$VM_VHDX_IMPORT"]="$GS_MGMT_GW"
VM_NET["$VM_VHDX_IMPORT"]="$GS_NET_MGMT"
VM_PROVISION["$VM_VHDX_IMPORT"]="infra/hypervisor/provision/ghostchain-vhdx-import-provision.sh"
VM_ARG["$VM_VHDX_IMPORT"]=""

# Web frontend VM (MGMT segment — serves ghostchain.cloud public subdomains)
VM_IP["$VM_WEB"]="${IP_WEB:-10.50.99.10}";           VM_GW["$VM_WEB"]="$GS_MGMT_GW"
VM_NET["$VM_WEB"]="$GS_NET_MGMT"
VM_PROVISION["$VM_WEB"]="infra/hypervisor/provision/ghost-web-provision.sh"
VM_ARG["$VM_WEB"]=""

# ── Start order: L1 first, then L2, then L3, then MGMT ───────────────────────
LAYER_ORDER=(
  "$VM_L1_MAINNET"
  "$VM_L1_TESTNET"
  "$VM_L1_VALIDATOR_MAINNET"
  "$VM_L1_VALIDATOR_TESTNET"
  "$VM_L1_ARCHIVE"
  "$VM_L2_MAINNET"
  "$VM_L2_TESTNET"
  "$VM_L3_MAINNET"
  "$VM_L3_TESTNET"
  "$VM_VHDX_IMPORT"
  "$VM_WEB"
)

# ── Step 0: Ensure libvirt networks exist ────────────────────────────────────
gen_net_xml() {
  local name="$1" bridge="$2" gw="$3" dhcp_start="$4" dhcp_end="$5" outfile="$6"
  cat > "$outfile" <<XML
<network>
  <name>${name}</name>
  <bridge name="${bridge}"/>
  <forward mode="nat"/>
  <ip address="${gw}" netmask="255.255.255.0">
    <dhcp>
      <range start="${dhcp_start}" end="${dhcp_end}"/>
    </dhcp>
  </ip>
</network>
XML
}

ensure_net() {
  local name="$1" xml="$2"
  if virsh net-info "$name" >/dev/null 2>&1; then
    log "Network already defined: $name"
  else
    log "Defining network: $name"
    virsh net-define "$xml"
  fi
  # Check active via net-list (avoids locale/whitespace issues with net-info grep)
  if ! virsh net-list --name 2>/dev/null | grep -qx "$name"; then
    virsh net-start "$name"
  fi
  virsh net-autostart "$name" >/dev/null
  ok "Network ready: $name"
}

info "» Ensuring libvirt networks exist..."
NET_XML_DIR="${SCRIPT_DIR}/../networks"
mkdir -p "$NET_XML_DIR"

gen_net_xml "$GS_NET_L1"   "$GS_BR_L1"   "$GS_L1_GW"   "$GS_L1_DHCP_START"   "$GS_L1_DHCP_END"   "${NET_XML_DIR}/${GS_NET_L1}.xml"
gen_net_xml "$GS_NET_L2"   "$GS_BR_L2"   "$GS_L2_GW"   "$GS_L2_DHCP_START"   "$GS_L2_DHCP_END"   "${NET_XML_DIR}/${GS_NET_L2}.xml"
gen_net_xml "$GS_NET_L3"   "$GS_BR_L3"   "$GS_L3_GW"   "$GS_L3_DHCP_START"   "$GS_L3_DHCP_END"   "${NET_XML_DIR}/${GS_NET_L3}.xml"
gen_net_xml "$GS_NET_MGMT" "$GS_BR_MGMT" "$GS_MGMT_GW" "$GS_MGMT_DHCP_START" "$GS_MGMT_DHCP_END" "${NET_XML_DIR}/${GS_NET_MGMT}.xml"

if [[ "$DRY_RUN" == "true" ]]; then
  warn "(dry-run) would ensure networks: $GS_NET_L1 $GS_NET_L2 $GS_NET_L3 $GS_NET_MGMT"
else
  ensure_net "$GS_NET_L1"   "${NET_XML_DIR}/${GS_NET_L1}.xml"
  ensure_net "$GS_NET_L2"   "${NET_XML_DIR}/${GS_NET_L2}.xml"
  ensure_net "$GS_NET_L3"   "${NET_XML_DIR}/${GS_NET_L3}.xml"
  ensure_net "$GS_NET_MGMT" "${NET_XML_DIR}/${GS_NET_MGMT}.xml"
fi

# ── Step 1: Attach VMs to the correct GhostStack network (idempotent) ────────
attach_vm_to_net() {
  local vm="$1" target_net="$2"
  local current_net
  current_net="$(virsh domiflist "$vm" 2>/dev/null \
    | awk 'NR>2 && NF>=5 {print $3; exit}')"

  if [[ "$current_net" == "$target_net" ]]; then
    log "${vm}: already on ${target_net}"
    return
  fi

  log "${vm}: moving from '${current_net}' → '${target_net}'"
  local tmpxml="/tmp/gs-vm-${vm}.xml"
  virsh dumpxml "$vm" > "$tmpxml"

  # Handle both type='network' and type='bridge' interface blocks.
  # We use Python for reliable multi-line XML editing.
  python3 - "$tmpxml" "$target_net" <<'PYEOF'
import sys, re

path, net = sys.argv[1], sys.argv[2]
txt = open(path).read()

def replace_iface(m):
    block = m.group(0)
    # Change type to 'network'
    block = re.sub(r"type='[^']*'", f"type='network'", block, count=1)
    # Replace source (any attribute form: network=, bridge=, dev=)
    block = re.sub(r"<source [^/]*/?>",
                   f"<source network='{net}'/>", block, count=1)
    return block

txt = re.sub(r"<interface\b[^>]*>.*?</interface>",
             replace_iface, txt, flags=re.DOTALL)
open(path, 'w').write(txt)
print(f"  XML updated for {sys.argv[1]}")
PYEOF

  virsh define "$tmpxml" >/dev/null
  rm -f "$tmpxml"
  ok "${vm}: NIC updated to ${target_net}"
}

info "» Attaching VMs to GhostStack networks..."
for vm in "${LAYER_ORDER[@]}"; do
  if virsh dominfo "$vm" >/dev/null 2>&1; then
    if [[ "$DRY_RUN" == "true" ]]; then
      warn "(dry-run) would attach ${vm} to ${VM_NET[$vm]}"
    else
      attach_vm_to_net "$vm" "${VM_NET[$vm]}"
    fi
  else
    warn "VM not found: ${vm} — skipping NIC update."
  fi
done

# ── Step 3: Register static DHCP leases ──────────────────────────────────────
register_dhcp_lease() {
  local vm="$1" net="$2" ip="$3"
  local mac
  mac="$(virsh domiflist "$vm" 2>/dev/null \
       | awk 'NR>2 && /52:54/ {print $5; exit}')"
  if [[ -z "$mac" ]]; then
    warn "Could not read MAC for ${vm} — DHCP lease not registered."
    return
  fi
  log "Registering DHCP lease: ${vm}  MAC=${mac}  IP=${ip}  net=${net}"
  if [[ "$DRY_RUN" == "true" ]]; then
    warn "(dry-run) virsh net-update $net add ip-dhcp-host ..."
    return
  fi
  # Remove any existing lease for this MAC first (idempotent)
  virsh net-update "$net" delete ip-dhcp-host \
    "<host mac='${mac}'/>" --live --config 2>/dev/null || true
  virsh net-update "$net" add ip-dhcp-host \
    "<host mac='${mac}' name='${vm}' ip='${ip}'/>" --live --config
  ok "DHCP lease registered: ${vm} → ${ip}"
}

info "» Registering static DHCP leases..."
for vm in "${LAYER_ORDER[@]}"; do
  if virsh dominfo "$vm" >/dev/null 2>&1; then
    register_dhcp_lease "$vm" "${VM_NET[$vm]}" "${VM_IP[$vm]}"
  else
    warn "VM not found in libvirt: ${vm} — skipping DHCP registration."
  fi
done

# ── Step 4: Fix image permissions so QEMU can read them ──────────────────────
info "» Fixing VM image permissions..."
if [[ "$DRY_RUN" != "true" ]]; then
  # 1. Recursively open permissions on all libvirt image dirs
  chmod -R o+rX /var/lib/libvirt 2>/dev/null || true

  # 2. Chown all image files to libvirt-qemu (the QEMU process user on Ubuntu)
  QEMU_USER="libvirt-qemu"
  find /var/lib/libvirt/images -type f \( -name '*.img' -o -name '*.qcow2' -o -name '*.raw' \) \
    -exec chown "${QEMU_USER}:kvm" {} \; 2>/dev/null || true
  find /var/lib/libvirt/images -type d \
    -exec chmod 755 {} \; 2>/dev/null || true

  # 3. Set seclabel type='none' on each GhostStack VM XML so AppArmor
  #    doesn't confine QEMU from reading these images
  for vm in "${LAYER_ORDER[@]}"; do
    virsh dominfo "$vm" >/dev/null 2>&1 || continue
    gs_xml="/tmp/gs-seclabel-${vm}.xml"
    virsh dumpxml "$vm" > "$gs_xml"
    if ! grep -q "seclabel" "$gs_xml"; then
      python3 - "$gs_xml" <<'PYEOF'
import sys, re
path = sys.argv[1]
txt = open(path).read()
# Insert <seclabel type='none'/> just before </domain>
txt = txt.replace('</domain>', "  <seclabel type='none'/>\n</domain>", 1)
open(path, 'w').write(txt)
PYEOF
      virsh define "$gs_xml" >/dev/null && log "AppArmor seclabel disabled: ${vm}"
    fi
    rm -f "$gs_xml"
  done
  ok "Image permissions and AppArmor seclabels fixed."
fi

# ── Step 5: Ensure VMs are running (L1 before L2, L2 before L3) ─────────────
start_vm() {
  local vm="$1"
  virsh dominfo "$vm" >/dev/null 2>&1 || { warn "VM not found: ${vm}"; return 0; }
  local state; state="$(virsh domstate "$vm" 2>/dev/null | tr -d '\r\n')"
  if [[ "$state" == "running" ]]; then
    log "Already running: ${vm}"; return 0
  fi
  if [[ "$DRY_RUN" == "true" ]]; then
    warn "(dry-run) would start: ${vm}"; return 0
  fi
  if virsh start "$vm" >/dev/null 2>&1; then
    ok "Started: ${vm}"
  else
    warn "Failed to start ${vm} — may be insufficient memory on hypervisor. Continuing..."
  fi
}

wait_for_ssh() {
  local ip="$1" vm="$2" max_tries="${3:-40}" sleep_s="${4:-5}"
  log "Waiting for SSH on ${vm} (${ip})..."
  for ((i=1; i<=max_tries; i++)); do
    if ssh "${SSH_OPTS[@]}" "${SSH_USER}@${ip}" 'true' 2>/dev/null; then
      ok "SSH ready: ${vm} (${ip})"
      return 0
    fi
    sleep "$sleep_s"
  done
  warn "SSH not reachable after $((max_tries*sleep_s))s: ${vm} (${ip})"
  return 1
}

info "» Starting VMs in layer order..."
for vm in "${LAYER_ORDER[@]}"; do
  start_vm "$vm"
done

# ── configure_static_ip: write netplan config inside VM ─────────────────────
configure_static_ip() {
  local vm="$1" ip="$2" gw="$3"
  local prefix="24"
  local iface
  # Detect the primary interface name (skip lo)
  iface="$(ssh "${SSH_OPTS[@]}" "${SSH_USER}@${ip}" \
    'ip -o link show | awk -F": " "!/lo/ && !/^[0-9]+: lo/ {print \$2; exit}"' 2>/dev/null || echo 'enp1s0')"
  iface="${iface%%@*}"  # strip @ifb suffix if any

  log "${vm}: configuring static IP ${ip}/${prefix} gw ${gw} on ${iface}"
  ssh "${SSH_OPTS[@]}" "${SSH_USER}@${ip}" bash -s -- \
    "$iface" "$ip" "$prefix" "$gw" <<'NETPLAN'
set -e
IFACE="$1" IP="$2" PREFIX="$3" GW="$4"
cat > /etc/netplan/99-ghoststack-static.yaml << EOF
network:
  version: 2
  ethernets:
    ${IFACE}:
      dhcp4: false
      addresses:
        - ${IP}/${PREFIX}
      routes:
        - to: default
          via: ${GW}
      nameservers:
        addresses: [1.1.1.1, 8.8.8.8]
EOF
chmod 600 /etc/netplan/99-ghoststack-static.yaml
# Apply without dropping SSH: netplan apply uses ip commands, not restart
netplan apply 2>&1 | grep -v 'Warning' || true
NETPLAN
  ok "${vm}: static IP applied (${ip}/${prefix})"
}

# ── Step 5: Copy repo + run provisioner in each VM ─────────────────────────────────────────────────────────────────────────────
provision_vm() {
  local vm="$1" ip="$2" script="$3" arg="${4:-}"

  if ! virsh dominfo "$vm" >/dev/null 2>&1; then
    warn "VM not found: ${vm} — skipping provision."
    return
  fi

  # Wait for SSH
  if ! wait_for_ssh "$ip" "$vm"; then
    warn "Skipping provision for ${vm} — SSH not available."
    return
  fi

  # Lock in static IP immediately so reboots never lose the address
  if [[ "$DRY_RUN" != "true" ]]; then
    configure_static_ip "$vm" "$ip" "${VM_GW[$vm]}"
  fi

  if [[ "$DRY_RUN" == "true" ]]; then
    warn "(dry-run) would provision: ${vm} via ${script} ${arg}"
    return
  fi

  # Push repo via rsync (faster than git clone inside VM)
  log "Syncing repo to ${vm} (${ip})..."
  rsync -az --delete \
    --exclude='.git' \
    --exclude='node_modules' \
    --exclude='infra/ghostchain/data' \
    --exclude='infra/opstack/data' \
    -e "ssh ${SSH_OPTS[*]}" \
    "${REPO_ROOT}/" \
    "${SSH_USER}@${ip}:/opt/ghostl-stack/"
  ok "Repo synced to ${vm}."

  # Run the provisioner as root
  log "Running provisioner on ${vm}: ${script} ${arg}"
  # shellcheck disable=SC2029
  ssh "${SSH_OPTS[@]}" "${SSH_USER}@${ip}" \
    "sudo bash /opt/ghostl-stack/${script} ${arg}" \
    || { warn "Provisioner exited non-zero on ${vm} — check logs inside the VM."; }
  ok "Provisioned: ${vm}"
}

info "» Provisioning VMs (strict layer order: L1 → L2 → L3 → MGMT)..."
for vm in "${LAYER_ORDER[@]}"; do
  provision_vm "$vm" \
    "${VM_IP[$vm]}" \
    "${VM_PROVISION[$vm]}" \
    "${VM_ARG[$vm]}"
done

# ── Step 4: Health summary ────────────────────────────────────────────────────
rpc_check() {
  local ip="$1" port="$2" label="$3"
  if curl -sS --max-time 5 \
      -H 'Content-Type: application/json' \
      --data '{"jsonrpc":"2.0","method":"web3_clientVersion","params":[],"id":1}' \
      "http://${ip}:${port}" >/dev/null 2>&1; then
    ok  "RPC OK: ${label} (${ip}:${port})"
  else
    warn "RPC not responding: ${label} (${ip}:${port}) — node may still be syncing."
  fi
}

info "» RPC health check..."
rpc_check "$IP_L1_MAINNET"          "$RPC_PORT_L1" "ghostchain-mainnet-l1"
rpc_check "$IP_L1_TESTNET"          "$RPC_PORT_L1" "ghostchain-testnet-l1"
rpc_check "$IP_L1_VALIDATOR_MAINNET" "$RPC_PORT_L1" "ghost-mainnet-validator"
rpc_check "$IP_L1_VALIDATOR_TESTNET" "$RPC_PORT_L1" "ghost-testnet-validator"
rpc_check "$IP_L1_ARCHIVE"          "$RPC_PORT_L1" "ghost-mainnet-archive-node"
rpc_check "$IP_L2_MAINNET"          "$RPC_PORT_L2" "ghostl2-mainnet"
rpc_check "$IP_L2_TESTNET"          "$RPC_PORT_L2" "ghostl2-testnet"
rpc_check "$IP_L3_MAINNET"          "$RPC_PORT_L3" "ghostl3-mainnet"
rpc_check "$IP_L3_TESTNET"          "$RPC_PORT_L3" "ghostl3-testnet"

echo ""
info "════════════════════════════════════════════════════════════"
info "  Static IP → VM mapping"
info "════════════════════════════════════════════════════════════"
printf "  %-30s %s\n"  "VM"  "IP"
printf "  %-30s %s\n"  "--"  "--"
for vm in "${LAYER_ORDER[@]}"; do
  printf "  %-30s %s\n" "$vm" "${VM_IP[$vm]}"
done

echo ""
info "════════════════════════════════════════════════════════════"
ok   "provision-all-vms complete."
info "════════════════════════════════════════════════════════════"
log  "Log saved to: $LOGFILE"
log  ""
log  "Next steps:"
log  "  1) Fill in REPLACE_ME values in /etc/ghostl-stack/*.env on each VM"
log  "  2) sudo systemctl restart ghostl1-mainnet ghostl2-mainnet ghostl3-mainnet"
log  "  3) virsh list --all          — confirm all VMs running"
log  "  4) nft list ruleset          — verify routing-law firewall"
log  "  5) Open Grafana on :${GRAFANA_PORT} to confirm health panels"
