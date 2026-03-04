#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# reprovision-production-vms.sh — Reprovision the GhostChain + GNS VM fleet
#
# Idempotent: skips VMs that already exist unless --force is passed.
# Run as root on the hypervisor.
#
# New VMs being stood up:
#   ghostchain-web              10.50.99.10   (alias for ghost-web)
#   ghost-ghostchain-bootnode-1 10.50.99.20
#   ghost-ghostchain-node1-1    10.50.99.21
#   ghost-ghostchain-node2-1    10.50.99.22
#   gns-bind9                   10.50.99.30
#   gns-kea                     10.50.99.31   (kea-ctrl-agent + kea-dhcp4 + kea-ddns)
#   gns-postgres                10.50.99.32
#   gns-indexer                 10.50.99.33
#   gns-api                     10.50.99.34
#
# Usage:
#   sudo bash reprovision-production-vms.sh              # safe, skips existing
#   sudo bash reprovision-production-vms.sh --force      # destroys and recreates
#   sudo bash reprovision-production-vms.sh --dry-run    # prints plan only
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/inventory.sh"

FORCE="${1:-}"
DRY_RUN=""
[[ "$FORCE" == "--dry-run" ]] && DRY_RUN="1" && FORCE=""
[[ "$FORCE" == "--force"   ]] || FORCE=""

IMGDIR="/var/lib/libvirt/images"
BASE_IMG="$IMGDIR/noble-server-cloudimg-amd64.img"
NETWORK="$GS_MGMT_NETWORK"
SSH_PUB_KEY="$(cat /home/ghost/.ssh/id_ed25519.pub 2>/dev/null || true)"
SSH_PUB_KEY_HV="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOszpCKq3RKu4vx4TehckR++Zf6limIrwy/SM0ki6j4b administrator@Ghoststack-baremetal"
REPO_URL="https://github.com/ghostchain1/ghostl-stack.git"
RAW_BASE="$(echo "$REPO_URL" | sed 's|github.com|raw.githubusercontent.com|; s|\.git$||')/main"

log()  { echo "[reprovision] $(date -u +%H:%M:%SZ) $*"; }
die()  { echo "[reprovision] FATAL: $*" >&2; exit 1; }

# ── VM fleet definition ───────────────────────────────────────────────────────
# Format: "NAME  IP  VCPU  RAM_MB  DISK_GB  MAC  ROLE"
declare -a NEW_VMS=(
  "ghost-ghostchain-bootnode-1 10.50.99.20 1  512  20  52:54:00:00:01:14 ghostchain-bootnode"
  "ghost-ghostchain-node1-1    10.50.99.21 2 4096 300  52:54:00:00:01:15 ghostchain-node"
  "ghost-ghostchain-node2-1    10.50.99.22 2 4096 300  52:54:00:00:01:16 ghostchain-node"
  "gns-bind9                   10.50.99.30 1  512  20  52:54:00:00:01:1e gns-bind9"
  "gns-kea                     10.50.99.31 1 1024  20  52:54:00:00:01:1f gns-kea"
  "gns-postgres                10.50.99.32 2 2048 100  52:54:00:00:01:20 gns-postgres"
  "gns-indexer                 10.50.99.33 2 2048  50  52:54:00:00:01:21 gns-indexer"
  "gns-api                     10.50.99.34 2 1024  30  52:54:00:00:01:22 gns-api"
)

# ── Prereqs ───────────────────────────────────────────────────────────────────
if [ -z "$DRY_RUN" ]; then
  [ "$(id -u)" -eq 0 ] || die "Must run as root"
  [ -f "$BASE_IMG" ] || die "Base cloud image not found: $BASE_IMG
  Download: cd $IMGDIR && wget https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img"
  command -v virsh        >/dev/null || die "virsh not found — install libvirt-clients"
  command -v virt-install >/dev/null || die "virt-install not found — apt install virtinst"
  command -v cloud-localds >/dev/null || apt-get install -y cloud-image-utils
fi

# ── DHCP reservation helper ───────────────────────────────────────────────────
add_dhcp_reservation() {
  local name="$1" mac="$2" ip="$3"
  if virsh net-dumpxml "$NETWORK" 2>/dev/null | grep -q "name='${name}'"; then
    log "  DHCP reservation already exists: ${name} (${ip})"
    return
  fi
  log "  Adding DHCP reservation: ${name} → ${mac} → ${ip}"
  [ -n "$DRY_RUN" ] && return
  virsh net-update "$NETWORK" add ip-dhcp-host \
    "<host mac='${mac}' name='${name}' ip='${ip}'/>" \
    --live --config 2>/dev/null || true
}

# ── Cloud-init builder ────────────────────────────────────────────────────────
build_cloud_init() {
  local name="$1" ip="$2" role="$3"
  local ci_dir="/tmp/cloud-init-${name}"
  install -d "$ci_dir"

  local provision_cmd
  case "$role" in
    ghostchain-bootnode)
      provision_cmd="curl -fsSL ${RAW_BASE}/infra/hypervisor/provision/ghostchain-node-provision.sh | ROLE=bootnode bash" ;;
    ghostchain-node)
      provision_cmd="curl -fsSL ${RAW_BASE}/infra/hypervisor/provision/ghostchain-node-provision.sh | ROLE=node bash" ;;
    gns-bind9)
      provision_cmd="curl -fsSL ${RAW_BASE}/infra/hypervisor/provision/gns-provision.sh | GNS_ROLE=bind9 bash" ;;
    gns-kea)
      provision_cmd="curl -fsSL ${RAW_BASE}/infra/hypervisor/provision/gns-provision.sh | GNS_ROLE=kea bash" ;;
    gns-postgres)
      provision_cmd="curl -fsSL ${RAW_BASE}/infra/hypervisor/provision/gns-provision.sh | GNS_ROLE=postgres bash" ;;
    gns-indexer)
      provision_cmd="curl -fsSL ${RAW_BASE}/infra/hypervisor/provision/gns-provision.sh | GNS_ROLE=indexer bash" ;;
    gns-api)
      provision_cmd="curl -fsSL ${RAW_BASE}/infra/hypervisor/provision/gns-provision.sh | GNS_ROLE=api bash" ;;
    *)
      provision_cmd="echo 'No provision script for role: ${role}'" ;;
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
packages: [curl, git, htop, jq, python3, ufw, qemu-guest-agent]

runcmd:
  - |
    set -e
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
            addresses: [10.50.99.30, 1.1.1.1]
    NETPLAN
    chmod 600 /etc/netplan/50-gs-mgmt.yaml
    netplan apply || true
  - systemctl enable --now qemu-guest-agent || true
  - ufw allow ssh && ufw allow from 10.50.99.0/24 && ufw --force enable
  - ${provision_cmd}

final_message: |
  GhostChain VM ${name} (${role}) cloud-init complete. IP: ${ip}
USERDATA

  echo "$ci_dir"
}

# ── Create / start a single VM ────────────────────────────────────────────────
provision_vm() {
  local entry="$1"
  # shellcheck disable=SC2086
  read -r name ip vcpu ram disk mac role <<< "$entry"

  local disk_img="$IMGDIR/${name}.qcow2"
  local ci_iso="$IMGDIR/${name}-cloud-init.iso"

  log "──────────────────────────────────────────────────────────"
  log "VM: ${name}  IP=${ip}  vCPU=${vcpu}  RAM=${ram}MiB  Disk=${disk}GiB"
  log "    MAC=${mac}  ROLE=${role}"

  # DHCP reservation first
  add_dhcp_reservation "$name" "$mac" "$ip"

  # Skip if already defined
  if virsh dominfo "$name" &>/dev/null; then
    if [ -n "$FORCE" ]; then
      log "  --force: destroying existing VM ${name}..."
      [ -z "$DRY_RUN" ] && {
        virsh destroy  "$name" 2>/dev/null || true
        virsh undefine "$name" --remove-all-storage 2>/dev/null || true
      }
    else
      log "  VM '${name}' already defined — skipping (use --force to recreate)"
      local state
      state=$(virsh domstate "$name" 2>/dev/null || echo "unknown")
      if [ "$state" != "running" ]; then
        log "  Starting ${name} (was: ${state})..."
        [ -z "$DRY_RUN" ] && virsh start "$name"
      fi
      return
    fi
  fi

  [ -n "$DRY_RUN" ] && { log "  [DRY-RUN] would create ${name}"; return; }

  # Thin-provisioned disk backed by cloud image
  log "  Creating disk: ${disk_img} (${disk}GiB)..."
  qemu-img create -f qcow2 -F qcow2 -b "$BASE_IMG" "$disk_img" "${disk}G"
  chown libvirt-qemu:kvm "$disk_img"

  # Cloud-init ISO
  log "  Building cloud-init ISO..."
  local ci_dir
  ci_dir="$(build_cloud_init "$name" "$ip" "$role")"
  cloud-localds "$ci_iso" "$ci_dir/user-data" "$ci_dir/meta-data"
  chown libvirt-qemu:kvm "$ci_iso"
  rm -rf "$ci_dir"

  # virt-install
  log "  Installing VM via virt-install..."
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
log "═══ GhostChain Production VM Reprovisioning ═══════════════════════════"
log "Hypervisor network : ${NETWORK} (${GS_MGMT_CIDR})"
log "Base image         : ${BASE_IMG}"
log "VMs to provision   : ${#NEW_VMS[@]}"
[ -n "$DRY_RUN" ] && log "*** DRY-RUN — no changes will be made ***"
[ -n "$FORCE"   ] && log "*** FORCE   — existing VMs will be destroyed and recreated ***"
echo ""

for entry in "${NEW_VMS[@]}"; do
  provision_vm "$entry"
done

echo ""
log "═══ Summary ════════════════════════════════════════════════════════════"
[ -z "$DRY_RUN" ] && {
  sleep 6
  log "Current VM states:"
  virsh list --all
  echo ""
  log "DHCP leases on ${NETWORK}:"
  virsh net-dhcp-leases "$NETWORK" 2>/dev/null || true
}
echo ""
log "All done. Cloud-init will run provision scripts on first boot."
log ""
log "Monitor progress:"
log "  sudo virsh console <vmname>"
log "  ssh ghost@10.50.99.<ip>"
log ""
log "Start services after provision:"
log "  # GNS BIND9"
log "  ssh ghost@10.50.99.30 'sudo systemctl start gns-bind9'"
log "  # GNS Kea"
log "  ssh ghost@10.50.99.31 'sudo systemctl start gns-kea-dhcp4 gns-kea-ddns gns-kea-ctrl-agent'"
log "  # GNS Postgres"
log "  ssh ghost@10.50.99.32 'sudo systemctl start gns-postgres'"
log "  # GNS Indexer"
log "  ssh ghost@10.50.99.33 'sudo systemctl start gns-indexer'"
log "  # GNS API"
log "  ssh ghost@10.50.99.34 'sudo systemctl start gns-api'"
log "  # GhostChain bootnode"
log "  ssh ghost@10.50.99.20 'sudo systemctl start ghostchain-bootnode'"
log "  # GhostChain nodes"
log "  ssh ghost@10.50.99.21 'sudo systemctl start ghostchain-node'"
log "  ssh ghost@10.50.99.22 'sudo systemctl start ghostchain-node'"
