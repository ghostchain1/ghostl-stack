#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# create-vms.sh — Create and start all GhostChain KVM VMs
#
# Run as root (or via sudo) on the hypervisor.
#
# VMs created:
#   ghost-web                10.50.99.10   2 vCPU   4GB  100GB
#   ghost-dns-slave          10.50.99.66   1 vCPU   1GB   20GB
#   ghostchain-devnet        10.50.99.45   4 vCPU   8GB  300GB
#   ghostchain-testnet-l1    10.50.99.71   2 vCPU   2GB  200GB
#   ghost-testnet-validator  10.50.99.73   2 vCPU   2GB  100GB
#   ghostl2-testnet          10.50.99.77   2 vCPU   4GB  120GB
#   ghostl3-testnet          10.50.99.79   2 vCPU   4GB  120GB
#   ghostchain-mainnet-l1    10.50.99.70   2 vCPU   6GB  500GB
#   ghost-mainnet-validator  10.50.99.72   2 vCPU   4GB  200GB
#   ghostl2-mainnet          10.50.99.76   2 vCPU   4GB  300GB
#   ghostl3-mainnet          10.50.99.78   2 vCPU   4GB  300GB
#
# Usage: sudo bash create-vms.sh [--dry-run]
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# Shared inventory — single source of truth for IPs and VM names.
# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/inventory.sh"

IMGDIR="/var/lib/libvirt/images"
BASE_IMG="$IMGDIR/noble-server-cloudimg-amd64.img"
NETWORK="$GS_MGMT_NETWORK"  # sourced from inventory.sh
SSH_PUB_KEY="$(cat /home/ghost/.ssh/id_ed25519.pub)"
SSH_PUB_KEY_HV="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOszpCKq3RKu4vx4TehckR++Zf6limIrwy/SM0ki6j4b administrator@Ghoststack-baremetal"
REPO_URL="https://github.com/ghostchain1/ghostl-stack.git"
RAW_BASE="$(echo "$REPO_URL" | sed 's|github.com|raw.githubusercontent.com|; s|\.git$||')/main"
DRY_RUN="${1:-}"

log()  { echo "[create-vms] $(date -u +%H:%M:%SZ) $*"; }
info() { echo "             $*"; }

# ── VM definitions: NAME  IP  VCPU  RAM_MB  DISK_GB  ROLE ──────────────────
# RAM sizing rationale:
#   dns/web : 512 / 4096 MB  — lightweight services
#   devnet  : 8192 MB        — runs full L1+L2+L3+tooling stack locally
#   L1      : 2048 MB testnet / 6144 MB mainnet   — geth + metrics
#   L2/L3   : 4096 MB        — op-geth + op-node + batcher + proposer
declare -A VM_IP VM_VCPU VM_RAM VM_DISK VM_ROLE VM_MAC VM_MAC2
# VM_MAC2: optional second NIC MAC (used for VMs with public-facing enp2s0)
# ghost-web (Next.js frontend + Traefik)
VM_IP[ghost-web]="10.50.99.10";          VM_VCPU[ghost-web]=2;   VM_RAM[ghost-web]=4096;   VM_DISK[ghost-web]=100;  VM_ROLE[ghost-web]="web";                   VM_MAC[ghost-web]="52:54:00:00:01:0a"
# ghost-dns-slave (Bind9 secondary)
VM_IP[ghost-dns-slave]="10.50.99.66";    VM_VCPU[ghost-dns-slave]=1;  VM_RAM[ghost-dns-slave]=512;   VM_DISK[ghost-dns-slave]=20;  VM_ROLE[ghost-dns-slave]="dns";             VM_MAC[ghost-dns-slave]="52:54:00:00:01:66"
# ghostchain-devnet (all-in-one build/test VM)
# enp1s0 = gs-mgmt internal (10.50.99.45), enp2s0 = public br0 (38.247.149.219)
VM_IP[ghostchain-devnet]="10.50.99.45";  VM_VCPU[ghostchain-devnet]=4; VM_RAM[ghostchain-devnet]=8192; VM_DISK[ghostchain-devnet]=300; VM_ROLE[ghostchain-devnet]="devnet";        VM_MAC[ghostchain-devnet]="52:54:00:00:01:2d"
VM_MAC2[ghostchain-devnet]="52:54:00:00:02:db"  # enp2s0 — public NIC (38.247.149.219)
# L1 testnet
VM_IP[ghostchain-testnet-l1]="10.50.99.71"; VM_VCPU[ghostchain-testnet-l1]=2; VM_RAM[ghostchain-testnet-l1]=2048; VM_DISK[ghostchain-testnet-l1]=200; VM_ROLE[ghostchain-testnet-l1]="l1-testnet-fullnode";   VM_MAC[ghostchain-testnet-l1]="52:54:00:00:01:71"
# L1 testnet validator
VM_IP[ghost-testnet-validator]="10.50.99.73"; VM_VCPU[ghost-testnet-validator]=2; VM_RAM[ghost-testnet-validator]=2048; VM_DISK[ghost-testnet-validator]=100; VM_ROLE[ghost-testnet-validator]="l1-testnet-validator"; VM_MAC[ghost-testnet-validator]="52:54:00:00:01:73"
# L2 testnet (op-geth + op-node + batcher + proposer)
VM_IP[ghostl2-testnet]="10.50.99.77"; VM_VCPU[ghostl2-testnet]=2; VM_RAM[ghostl2-testnet]=4096; VM_DISK[ghostl2-testnet]=120; VM_ROLE[ghostl2-testnet]="l2-testnet";           VM_MAC[ghostl2-testnet]="52:54:00:00:01:77"
# L3 testnet (l3-geth + l3-op-node + batcher + proposer)
VM_IP[ghostl3-testnet]="10.50.99.79"; VM_VCPU[ghostl3-testnet]=2; VM_RAM[ghostl3-testnet]=4096; VM_DISK[ghostl3-testnet]=120; VM_ROLE[ghostl3-testnet]="l3-testnet";           VM_MAC[ghostl3-testnet]="52:54:00:00:01:79"
# L1 mainnet
VM_IP[ghostchain-mainnet-l1]="10.50.99.70"; VM_VCPU[ghostchain-mainnet-l1]=2; VM_RAM[ghostchain-mainnet-l1]=6144; VM_DISK[ghostchain-mainnet-l1]=500; VM_ROLE[ghostchain-mainnet-l1]="l1-mainnet-fullnode";   VM_MAC[ghostchain-mainnet-l1]="52:54:00:00:01:70"
# L1 mainnet validator
VM_IP[ghost-mainnet-validator]="10.50.99.72"; VM_VCPU[ghost-mainnet-validator]=2; VM_RAM[ghost-mainnet-validator]=4096; VM_DISK[ghost-mainnet-validator]=200; VM_ROLE[ghost-mainnet-validator]="l1-mainnet-validator"; VM_MAC[ghost-mainnet-validator]="52:54:00:00:01:72"
# L2 mainnet (op-geth + op-node + batcher + proposer)
VM_IP[ghostl2-mainnet]="10.50.99.76"; VM_VCPU[ghostl2-mainnet]=2; VM_RAM[ghostl2-mainnet]=4096; VM_DISK[ghostl2-mainnet]=300; VM_ROLE[ghostl2-mainnet]="l2-mainnet";           VM_MAC[ghostl2-mainnet]="52:54:00:00:01:76"
# L3 mainnet (l3-geth + l3-op-node + batcher + proposer)
VM_IP[ghostl3-mainnet]="10.50.99.78"; VM_VCPU[ghostl3-mainnet]=2; VM_RAM[ghostl3-mainnet]=4096; VM_DISK[ghostl3-mainnet]=300; VM_ROLE[ghostl3-mainnet]="l3-mainnet";           VM_MAC[ghostl3-mainnet]="52:54:00:00:01:78"
# GhostChain L1 cluster nodes
VM_IP[ghost-ghostchain-bootnode-1]="10.50.99.20"; VM_VCPU[ghost-ghostchain-bootnode-1]=1; VM_RAM[ghost-ghostchain-bootnode-1]=512;  VM_DISK[ghost-ghostchain-bootnode-1]=20;  VM_ROLE[ghost-ghostchain-bootnode-1]="ghostchain-bootnode"; VM_MAC[ghost-ghostchain-bootnode-1]="52:54:00:00:01:14"
VM_IP[ghost-ghostchain-node1-1]="10.50.99.21";    VM_VCPU[ghost-ghostchain-node1-1]=2;  VM_RAM[ghost-ghostchain-node1-1]=4096; VM_DISK[ghost-ghostchain-node1-1]=300; VM_ROLE[ghost-ghostchain-node1-1]="ghostchain-node";      VM_MAC[ghost-ghostchain-node1-1]="52:54:00:00:01:15"
VM_IP[ghost-ghostchain-node2-1]="10.50.99.22";    VM_VCPU[ghost-ghostchain-node2-1]=2;  VM_RAM[ghost-ghostchain-node2-1]=4096; VM_DISK[ghost-ghostchain-node2-1]=300; VM_ROLE[ghost-ghostchain-node2-1]="ghostchain-node";      VM_MAC[ghost-ghostchain-node2-1]="52:54:00:00:01:16"
# GNS (Ghost Name Service) VM fleet
VM_IP[gns-bind9]="10.50.99.30";   VM_VCPU[gns-bind9]=1;   VM_RAM[gns-bind9]=512;  VM_DISK[gns-bind9]=20;  VM_ROLE[gns-bind9]="gns-bind9";    VM_MAC[gns-bind9]="52:54:00:00:01:1e"
VM_IP[gns-kea]="10.50.99.31";     VM_VCPU[gns-kea]=1;     VM_RAM[gns-kea]=1024; VM_DISK[gns-kea]=20;   VM_ROLE[gns-kea]="gns-kea";        VM_MAC[gns-kea]="52:54:00:00:01:1f"
VM_IP[gns-postgres]="10.50.99.32"; VM_VCPU[gns-postgres]=2; VM_RAM[gns-postgres]=2048; VM_DISK[gns-postgres]=100; VM_ROLE[gns-postgres]="gns-postgres"; VM_MAC[gns-postgres]="52:54:00:00:01:20"
VM_IP[gns-indexer]="10.50.99.33";  VM_VCPU[gns-indexer]=2;  VM_RAM[gns-indexer]=2048; VM_DISK[gns-indexer]=50;  VM_ROLE[gns-indexer]="gns-indexer";  VM_MAC[gns-indexer]="52:54:00:00:01:21"
VM_IP[gns-api]="10.50.99.34";      VM_VCPU[gns-api]=2;      VM_RAM[gns-api]=1024; VM_DISK[gns-api]=30;   VM_ROLE[gns-api]="gns-api";        VM_MAC[gns-api]="52:54:00:00:01:22"

# Ordered boot sequence — infra first, then clustered services, then testnet/mainnet
BOOT_ORDER=(
  # Infra / frontend
  ghost-web
  ghost-dns-slave
  # GhostChain L1 cluster
  ghost-ghostchain-bootnode-1
  ghost-ghostchain-node1-1
  ghost-ghostchain-node2-1
  # GNS fleet
  gns-bind9
  gns-kea
  gns-postgres
  gns-indexer
  gns-api
  # Devnet / testnet / mainnet
  ghostchain-devnet
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

# Validate: every VM in BOOT_ORDER must be defined in our arrays.
for _vm in "${BOOT_ORDER[@]}"; do
  if [ -z "${VM_IP[$_vm]:-}" ]; then
    log "ERROR: VM '${_vm}' is in BOOT_ORDER but has no IP defined — check VM arrays above."
    exit 1
  fi
done
unset _vm

log "Adding DHCP reservations to ${NETWORK}..."
for name in "${BOOT_ORDER[@]}"; do
  add_dhcp_reservation "$name" "${VM_MAC[$name]}" "${VM_IP[$name]}"
done

# ── Build cloud-init user-data for a given VM ─────────────────────────────────
make_cloud_init() {
  local name="$1" role="$2" ip="$3"
  # Determine public IP for VMs that have a second NIC on br0
  local public_ip="" public_gw="${GS_PUBLIC_GW}"
  case "$name" in
    ghostchain-devnet) public_ip="${GS_DEVNET_PUBLIC_IP}" ;;
  esac
  local ci_dir="/tmp/cloud-init-${name}"
  mkdir -p "$ci_dir"

  # Determine provision script and env vars based on role
  local provision_cmd=""
  case "$role" in
    web)
      provision_cmd="curl -fsSL ${RAW_BASE}/infra/hypervisor/provision/ghost-web-provision.sh | sudo bash"
      ;;
    devnet)
      provision_cmd="curl -fsSL ${RAW_BASE}/infra/hypervisor/provision/ghostchain-devnet-provision.sh | sudo bash"
      ;;
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
    ghostchain-bootnode)
      provision_cmd="curl -fsSL ${RAW_BASE}/infra/hypervisor/provision/ghostchain-node-provision.sh | sudo ROLE=bootnode bash"
      ;;
    ghostchain-node)
      provision_cmd="curl -fsSL ${RAW_BASE}/infra/hypervisor/provision/ghostchain-node-provision.sh | sudo ROLE=node bash"
      ;;
    gns-bind9)
      provision_cmd="curl -fsSL ${RAW_BASE}/infra/hypervisor/provision/gns-provision.sh | sudo GNS_ROLE=bind9 bash"
      ;;
    gns-kea)
      provision_cmd="curl -fsSL ${RAW_BASE}/infra/hypervisor/provision/gns-provision.sh | sudo GNS_ROLE=kea bash"
      ;;
    gns-postgres)
      provision_cmd="curl -fsSL ${RAW_BASE}/infra/hypervisor/provision/gns-provision.sh | sudo GNS_ROLE=postgres bash"
      ;;
    gns-indexer)
      provision_cmd="curl -fsSL ${RAW_BASE}/infra/hypervisor/provision/gns-provision.sh | sudo GNS_ROLE=indexer bash"
      ;;
    gns-api)
      provision_cmd="curl -fsSL ${RAW_BASE}/infra/hypervisor/provision/gns-provision.sh | sudo GNS_ROLE=api bash"
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
    # Configure internal management NIC (enp1s0)
    cat > /etc/netplan/50-gs-mgmt.yaml <<'NETPLAN'
    network:
      version: 2
      ethernets:
        enp1s0:
          dhcp4: false
          addresses: [${ip}/24]
          routes:
            - to: 10.50.99.0/24
              via: 10.50.99.1
          nameservers:
            addresses: [10.50.99.66, 1.1.1.1]
    NETPLAN
    chmod 600 /etc/netplan/50-gs-mgmt.yaml
    # Configure public NIC (enp2s0) if this VM has a public IP assignment
    if [ -n "${public_ip:-}" ]; then
      cat > /etc/netplan/51-gs-public.yaml <<'NETPLAN2'
    network:
      version: 2
      ethernets:
        enp2s0:
          dhcp4: false
          addresses: [${public_ip}/24]
          routes:
            - to: default
              via: ${public_gw}
          nameservers:
            addresses: [1.1.1.1, 8.8.8.8]
    NETPLAN2
      chmod 600 /etc/netplan/51-gs-public.yaml
    fi
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
  local extra_nics=()
  if [ -n "${VM_MAC2[$name]:-}" ]; then
    # Second NIC bridges directly onto br0 (the public bridge) so the VM can
    # hold a public IP without NAT.  br0 must exist on the hypervisor host.
    extra_nics=(--network "bridge=br0,model=virtio,mac=${VM_MAC2[$name]}")
    log "  Attaching public NIC: mac=${VM_MAC2[$name]} on br0"
  fi
  virt-install \
    --name        "$name" \
    --memory      "$ram" \
    --vcpus       "$vcpu" \
    --cpu         host-passthrough \
    --disk        "path=${disk_img},format=qcow2,bus=virtio,cache=writeback" \
    --disk        "path=${ci_iso},device=cdrom,bus=sata" \
    --network     "network=${NETWORK},model=virtio,mac=${mac}" \
    "${extra_nics[@]}" \
    --os-variant  ubuntu24.04 \
    --graphics    none \
    --noautoconsole \
    --import \
    --watchdog    default,action=reset \
    --channel     unix,target_type=virtio,name=org.qemu.guest_agent.0

  # Enable autostart so VMs survive hypervisor reboots (production requirement)
  virsh autostart "$name"
  log "  VM ${name} defined, started, and autostart enabled."
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
