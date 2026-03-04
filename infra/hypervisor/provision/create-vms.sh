#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# create-vms.sh — Create and start all GhostChain KVM VMs
#
# Run as root (or via sudo) on the hypervisor.
#
# VMs created:
#   ghost-dns-slave          10.50.99.66   1 vCPU  1GB   20GB
#   ghostchain-testnet-l1    10.50.99.71   2 vCPU  2GB  200GB
#   ghost-testnet-validator  10.50.99.73   2 vCPU  2GB  100GB
#   ghostl2-testnet          10.50.99.77   2 vCPU  2GB  120GB
#   ghostl3-testnet          10.50.99.79   2 vCPU  2GB  120GB
#   ghostchain-mainnet-l1    10.50.99.70   2 vCPU  4GB  500GB
#   ghost-mainnet-validator  10.50.99.72   2 vCPU  4GB  200GB
#   ghostl2-mainnet          10.50.99.76   2 vCPU  4GB  300GB
#   ghostl3-mainnet          10.50.99.78   2 vCPU  4GB  300GB
#
# Usage: sudo bash create-vms.sh [--dry-run]
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

IMGDIR="/var/lib/libvirt/images"
BASE_IMG="$IMGDIR/noble-server-cloudimg-amd64.img"
NETWORK="gs-mgmt"
SSH_PUB_KEY="$(cat /home/ghost/.ssh/id_ed25519.pub)"
SSH_PUB_KEY_HV="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOszpCKq3RKu4vx4TehckR++Zf6limIrwy/SM0ki6j4b administrator@Ghoststack-baremetal"
REPO_URL="https://github.com/ghostchain1/ghostl-stack.git"
RAW_BASE="$(echo "$REPO_URL" | sed 's|github.com|raw.githubusercontent.com|; s|\.git$||')/main"
DRY_RUN="${1:-}"

log()  { echo "[create-vms] $(date -u +%H:%M:%SZ) $*"; }
info() { echo "             $*"; }

# ── VM definitions: NAME  IP  VCPU  RAM_MB  DISK_GB  ROLE ──────────────────
declare -A VM_IP VM_VCPU VM_RAM VM_DISK VM_ROLE VM_MAC
# ghost-dns-slave
VM_IP[ghost-dns-slave]="10.50.99.66";   VM_VCPU[ghost-dns-slave]=1;  VM_RAM[ghost-dns-slave]=512;   VM_DISK[ghost-dns-slave]=20;  VM_ROLE[ghost-dns-slave]="dns";                 VM_MAC[ghost-dns-slave]="52:54:00:00:01:66"
# L1 testnet
VM_IP[ghostchain-testnet-l1]="10.50.99.71"; VM_VCPU[ghostchain-testnet-l1]=2; VM_RAM[ghostchain-testnet-l1]=1024; VM_DISK[ghostchain-testnet-l1]=200; VM_ROLE[ghostchain-testnet-l1]="l1-testnet-fullnode";   VM_MAC[ghostchain-testnet-l1]="52:54:00:00:01:71"
# L1 testnet validator
VM_IP[ghost-testnet-validator]="10.50.99.73"; VM_VCPU[ghost-testnet-validator]=2; VM_RAM[ghost-testnet-validator]=1024; VM_DISK[ghost-testnet-validator]=100; VM_ROLE[ghost-testnet-validator]="l1-testnet-validator"; VM_MAC[ghost-testnet-validator]="52:54:00:00:01:73"
# L2 testnet
VM_IP[ghostl2-testnet]="10.50.99.77"; VM_VCPU[ghostl2-testnet]=2; VM_RAM[ghostl2-testnet]=1024; VM_DISK[ghostl2-testnet]=120; VM_ROLE[ghostl2-testnet]="l2-testnet";           VM_MAC[ghostl2-testnet]="52:54:00:00:01:77"
# L3 testnet
VM_IP[ghostl3-testnet]="10.50.99.79"; VM_VCPU[ghostl3-testnet]=2; VM_RAM[ghostl3-testnet]=1024; VM_DISK[ghostl3-testnet]=120; VM_ROLE[ghostl3-testnet]="l3-testnet";           VM_MAC[ghostl3-testnet]="52:54:00:00:01:79"
# L1 mainnet
VM_IP[ghostchain-mainnet-l1]="10.50.99.70"; VM_VCPU[ghostchain-mainnet-l1]=2; VM_RAM[ghostchain-mainnet-l1]=1024; VM_DISK[ghostchain-mainnet-l1]=500; VM_ROLE[ghostchain-mainnet-l1]="l1-mainnet-fullnode";   VM_MAC[ghostchain-mainnet-l1]="52:54:00:00:01:70"
# L1 mainnet validator
VM_IP[ghost-mainnet-validator]="10.50.99.72"; VM_VCPU[ghost-mainnet-validator]=2; VM_RAM[ghost-mainnet-validator]=1024; VM_DISK[ghost-mainnet-validator]=200; VM_ROLE[ghost-mainnet-validator]="l1-mainnet-validator"; VM_MAC[ghost-mainnet-validator]="52:54:00:00:01:72"
# L2 mainnet
VM_IP[ghostl2-mainnet]="10.50.99.76"; VM_VCPU[ghostl2-mainnet]=2; VM_RAM[ghostl2-mainnet]=1024; VM_DISK[ghostl2-mainnet]=300; VM_ROLE[ghostl2-mainnet]="l2-mainnet";           VM_MAC[ghostl2-mainnet]="52:54:00:00:01:76"
# L3 mainnet
VM_IP[ghostl3-mainnet]="10.50.99.78"; VM_VCPU[ghostl3-mainnet]=2; VM_RAM[ghostl3-mainnet]=1024; VM_DISK[ghostl3-mainnet]=300; VM_ROLE[ghostl3-mainnet]="l3-mainnet";           VM_MAC[ghostl3-mainnet]="52:54:00:00:01:78"

# Ordered boot sequence — testnet first, then mainnet
BOOT_ORDER=(
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

# ── Prereq checks ─────────────────────────────────────────────────────────────
[ -f "$BASE_IMG" ] || { log "ERROR: Base image not found: $BASE_IMG"; exit 1; }
command -v cloud-localds >/dev/null || apt-get install -y cloud-image-utils
command -v virsh >/dev/null || { log "ERROR: virsh not found"; exit 1; }
command -v virt-install >/dev/null || apt-get install -y virtinst

# ── Add static DHCP reservations to gs-mgmt network ──────────────────────────
add_dhcp_reservation() {
  local name="$1" mac="$2" ip="$3"
  # Skip if already present
  if virsh net-dumpxml "$NETWORK" 2>/dev/null | grep -q "name='${name}'"; then
    log "  DHCP reservation already exists for ${name}"
    return
  fi
  log "  Adding DHCP reservation: ${name} → ${mac} → ${ip}"
  [ "$DRY_RUN" = "--dry-run" ] && return
  virsh net-update "$NETWORK" add ip-dhcp-host \
    "<host mac='${mac}' name='${name}' ip='${ip}'/>" \
    --live --config 2>/dev/null || true
}

log "Adding DHCP reservations to ${NETWORK}..."
for name in "${BOOT_ORDER[@]}"; do
  add_dhcp_reservation "$name" "${VM_MAC[$name]}" "${VM_IP[$name]}"
done

# ── Build cloud-init user-data for a given VM ─────────────────────────────────
make_cloud_init() {
  local name="$1" role="$2" ip="$3"
  local ci_dir="/tmp/cloud-init-${name}"
  mkdir -p "$ci_dir"

  # Determine provision script and env vars based on role
  local provision_cmd=""
  case "$role" in
    dns)
      provision_cmd="echo 'DNS slave configured — no extra provision needed'"
      ;;
    l1-testnet-fullnode)
      provision_cmd="curl -fsSL ${RAW_BASE}/infra/hypervisor/provision/ghostchain-l1-provision.sh | sudo ENV=testnet ROLE=fullnode bash"
      ;;
    l1-testnet-validator)
      provision_cmd="curl -fsSL ${RAW_BASE}/infra/hypervisor/provision/ghostchain-l1-provision.sh | sudo ENV=testnet ROLE=validator bash"
      ;;
    l2-testnet)
      provision_cmd="curl -fsSL ${RAW_BASE}/infra/hypervisor/provision/ghostl2-provision.sh | sudo ENV=testnet bash"
      ;;
    l3-testnet)
      provision_cmd="curl -fsSL ${RAW_BASE}/infra/hypervisor/provision/ghostl3-provision.sh | sudo ENV=testnet bash"
      ;;
    l1-mainnet-fullnode)
      provision_cmd="curl -fsSL ${RAW_BASE}/infra/hypervisor/provision/ghostchain-l1-provision.sh | sudo ENV=mainnet ROLE=fullnode bash"
      ;;
    l1-mainnet-validator)
      provision_cmd="curl -fsSL ${RAW_BASE}/infra/hypervisor/provision/ghostchain-l1-provision.sh | sudo ENV=mainnet ROLE=validator bash"
      ;;
    l2-mainnet)
      provision_cmd="curl -fsSL ${RAW_BASE}/infra/hypervisor/provision/ghostl2-provision.sh | sudo ENV=mainnet bash"
      ;;
    l3-mainnet)
      provision_cmd="curl -fsSL ${RAW_BASE}/infra/hypervisor/provision/ghostl3-provision.sh | sudo ENV=mainnet bash"
      ;;
  esac

  cat > "$ci_dir/meta-data" <<META
instance-id: ${name}
local-hostname: ${name}
META

  cat > "$ci_dir/user-data" <<USERDATA
#cloud-config
hostname: ${name}
fqdn: ${name}.ghostchain.internal
manage_etc_hosts: true
timezone: UTC

users:
  - name: ghost
    gecos: Ghost Admin
    groups: [sudo, docker]
    sudo: ALL=(ALL) NOPASSWD:ALL
    shell: /bin/bash
    lock_passwd: true
    ssh_authorized_keys:
      - ${SSH_PUB_KEY}
      - ${SSH_PUB_KEY_HV}
  - name: root
    ssh_authorized_keys:
      - ${SSH_PUB_KEY}
      - ${SSH_PUB_KEY_HV}

package_update: true
package_upgrade: false
packages:
  - curl
  - git
  - htop
  - jq
  - python3
  - ufw

runcmd:
  - |
    set -e
    # Static IP via netplan
    cat > /etc/netplan/50-gs-mgmt.yaml <<'NETPLAN'
    network:
      version: 2
      ethernets:
        enp1s0:
          dhcp4: false
          addresses: [${ip}/24]
          routes:
            - to: default
              via: 10.50.99.1
          nameservers:
            addresses: [10.50.99.66, 1.1.1.1]
    NETPLAN
    chmod 600 /etc/netplan/50-gs-mgmt.yaml
    netplan apply || true
  - ufw allow ssh
  - ufw allow from 10.50.99.0/24
  - ufw --force enable
  - ${provision_cmd}

final_message: |
  GhostChain VM ${name} (${role}) cloud-init complete.
  IP: ${ip}
USERDATA

  echo "$ci_dir"
}

# ── Create a single VM ────────────────────────────────────────────────────────
create_vm() {
  local name="$1"
  local ip="${VM_IP[$name]}"
  local vcpu="${VM_VCPU[$name]}"
  local ram="${VM_RAM[$name]}"
  local disk_gb="${VM_DISK[$name]}"
  local role="${VM_ROLE[$name]}"
  local mac="${VM_MAC[$name]}"
  local disk_img="$IMGDIR/${name}.qcow2"
  local ci_iso="$IMGDIR/${name}-cloud-init.iso"

  log "────────────────────────────────────────────────────────────────────"
  log "Creating VM: ${name}"
  info "IP=${ip}  MAC=${mac}  vCPU=${vcpu}  RAM=${ram}MB  Disk=${disk_gb}GB"
  info "ROLE=${role}"

  # Skip if already defined
  if virsh dominfo "$name" &>/dev/null; then
    log "  VM '${name}' already defined — skipping creation"
    # Start if not running
    state=$(virsh domstate "$name" 2>/dev/null || echo "unknown")
    if [ "$state" != "running" ]; then
      log "  Starting ${name} (was: ${state})..."
      [ "$DRY_RUN" = "--dry-run" ] || virsh start "$name"
    else
      log "  Already running."
    fi
    return
  fi

  [ "$DRY_RUN" = "--dry-run" ] && { log "  [DRY-RUN] would create ${name}"; return; }

  # 1. Create qcow2 disk backed by base cloud image (thin provisioned)
  log "  Creating disk: ${disk_img} (${disk_gb}GB, backed by base image)..."
  qemu-img create -f qcow2 -F qcow2 -b "$BASE_IMG" "$disk_img" "${disk_gb}G"
  chown libvirt-qemu:kvm "$disk_img"

  # 2. Build cloud-init ISO
  log "  Building cloud-init ISO..."
  local ci_dir
  ci_dir="$(make_cloud_init "$name" "$role" "$ip")"
  cloud-localds "$ci_iso" "$ci_dir/user-data" "$ci_dir/meta-data"
  chown libvirt-qemu:kvm "$ci_iso"
  rm -rf "$ci_dir"

  # 3. Install (define) the VM
  log "  Defining VM via virt-install..."
  virt-install \
    --name        "$name" \
    --memory      "$ram" \
    --vcpus       "$vcpu" \
    --cpu         host-passthrough \
    --disk        "path=${disk_img},format=qcow2,bus=virtio,cache=writeback" \
    --disk        "path=${ci_iso},device=cdrom,bus=sata" \
    --network     "network=${NETWORK},model=virtio,mac=${mac}" \
    --os-variant  ubuntu24.04 \
    --graphics    none \
    --noautoconsole \
    --import \
    --watchdog    default,action=reset \
    --channel     unix,target_type=virtio,name=org.qemu.guest_agent.0

  log "  VM ${name} defined and started."
}

# ── Main ──────────────────────────────────────────────────────────────────────
log "═══ GhostChain VM Creation ══════════════════════════════════════════════"
log "Base image : ${BASE_IMG}"
log "Network    : ${NETWORK} (10.50.99.0/24)"
log "VMs to create: ${#BOOT_ORDER[@]}"
[ "$DRY_RUN" = "--dry-run" ] && log "*** DRY-RUN MODE — no changes will be made ***"
echo ""

for name in "${BOOT_ORDER[@]}"; do
  create_vm "$name"
done

echo ""
log "═══ Summary ═════════════════════════════════════════════════════════════"
log "Waiting 10s for VMs to get DHCP leases..."
[ "$DRY_RUN" != "--dry-run" ] && sleep 10

virsh list --all
echo ""
log "DHCP leases:"
virsh net-dhcp-leases "$NETWORK" 2>/dev/null || true
echo ""
log "All VMs created. Cloud-init will run provision scripts on first boot."
log "Monitor with:  sudo virsh console <name>"
log "Check logs:    sudo virsh domstate <name>"
log "SSH access:    ssh ghost@10.50.99.<ip>"
