#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# reprovision-all.sh — Full fleet reprovision: update existing VMs + create new
#
# What it does:
#   Phase 1 — Provision NEW VMs (ghostchain node cluster + GNS fleet)
#              delegates to reprovision-production-vms.sh (skips existing).
#   Phase 2 — Update EXISTING running VMs:
#              git pull /opt/ghostl-stack on each, re-run their provision
#              script in-place, restart affected systemd services.
#
# Usage (run as root on the hypervisor):
#   sudo bash reprovision-all.sh                # both phases
#   sudo bash reprovision-all.sh --new-only     # Phase 1 only (create new VMs)
#   sudo bash reprovision-all.sh --update-only  # Phase 2 only (update existing)
#   sudo bash reprovision-all.sh --dry-run      # print plan, no changes
#
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/inventory.sh"

REPO_URL="https://github.com/ghostchain1/ghostl-stack.git"
REPO_DIR="/opt/ghostl-stack"
SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=12 -o BatchMode=yes"
SSH_KEY="${SSH_KEY:-/home/ghost/.ssh/id_ed25519}"
SSH_USER="${SSH_USER:-ghost}"
NEW_ONLY=0
UPDATE_ONLY=0
DRY_RUN=0

for arg in "$@"; do
  case "$arg" in
    --new-only)    NEW_ONLY=1    ;;
    --update-only) UPDATE_ONLY=1 ;;
    --dry-run)     DRY_RUN=1     ;;
    *) echo "Unknown arg: $arg"; exit 1 ;;
  esac
done

log()  { echo "[reprovision-all] $(date -u +%H:%M:%SZ) $*"; }
warn() { echo "[reprovision-all] WARN: $*" >&2; }
die()  { echo "[reprovision-all] FATAL: $*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Must run as root (sudo)"

# ─────────────────────────────────────────────────────────────────────────────
# Phase 1 — Provision new VMs
# ─────────────────────────────────────────────────────────────────────────────
phase1_provision_new() {
  log "══════════════════════════════════════════════════════════════════"
  log "PHASE 1 — Provisioning new VMs (skips existing)"
  log "══════════════════════════════════════════════════════════════════"
  local repro="${SCRIPT_DIR}/reprovision-production-vms.sh"
  [ -f "$repro" ] || die "reprovision-production-vms.sh not found at $repro"
  if [ "$DRY_RUN" -eq 1 ]; then
    log "[DRY-RUN] would run: sudo bash $repro"
    return
  fi
  bash "$repro"
  log "Phase 1 complete."
}

# ─────────────────────────────────────────────────────────────────────────────
# Phase 2 — Update existing running VMs
# ─────────────────────────────────────────────────────────────────────────────

# Map each VM → role tag used by its provision script
declare -A VM_ROLE=(
  [ghost-web]="ghost-web"
  [ghost-dns-slave]="dns-slave"
  [ghostchain-devnet]="ghostchain-devnet"
  [ghostchain-testnet-l1]="ghostchain-l1"
  [ghostchain-mainnet-l1]="ghostchain-l1"
  [ghost-testnet-validator]="ghostchain-l1"
  [ghost-mainnet-validator]="ghostchain-l1"
  [ghostl2-testnet]="ghostl2"
  [ghostl2-mainnet]="ghostl2"
  [ghostl3-testnet]="ghostl3"
  [ghostl3-mainnet]="ghostl3"
  # New GhostChain node cluster
  [ghost-ghostchain-bootnode-1]="ghostchain-bootnode"
  [ghost-ghostchain-node1-1]="ghostchain-node"
  [ghost-ghostchain-node2-1]="ghostchain-node"
  # GNS fleet
  [gns-bind9]="gns-bind9"
  [gns-kea]="gns-kea"
  [gns-postgres]="gns-postgres"
  [gns-indexer]="gns-indexer"
  [gns-api]="gns-api"
)

# Build the remote provision command for a given role
provision_cmd_for_role() {
  local role="$1"
  local dir="$REPO_DIR/infra/hypervisor/provision"
  case "$role" in
    ghost-web)
      echo "bash ${dir}/ghost-web-provision.sh" ;;
    dns-slave)
      echo "bash ${dir}/ghostchain-node-provision.sh  # DNS slave — git pull is sufficient" ;;
    ghostchain-devnet)
      echo "bash ${dir}/ghostchain-devnet-provision.sh" ;;
    ghostchain-l1)
      echo "bash ${dir}/ghostchain-l1-provision.sh" ;;
    ghostchain-bootnode)
      echo "ROLE=bootnode bash ${dir}/ghostchain-node-provision.sh" ;;
    ghostchain-node)
      echo "ROLE=node bash ${dir}/ghostchain-node-provision.sh" ;;
    ghostl2)
      echo "bash ${dir}/ghostl2-provision.sh" ;;
    ghostl3)
      echo "bash ${dir}/ghostl3-provision.sh" ;;
    gns-bind9)
      echo "GNS_ROLE=bind9    bash ${dir}/gns-provision.sh" ;;
    gns-kea)
      echo "GNS_ROLE=kea      bash ${dir}/gns-provision.sh" ;;
    gns-postgres)
      echo "GNS_ROLE=postgres bash ${dir}/gns-provision.sh" ;;
    gns-indexer)
      echo "GNS_ROLE=indexer  bash ${dir}/gns-provision.sh" ;;
    gns-api)
      echo "GNS_ROLE=api      bash ${dir}/gns-provision.sh" ;;
    *)
      echo "echo 'no provision script for role: ${role}'" ;;
  esac
}

update_vm() {
  local name="$1"
  local ip
  ip="$(vm_ip "$name")"
  if [ -z "$ip" ]; then
    warn "  No IP mapping for VM '${name}' — skipping"
    return
  fi

  local role="${VM_ROLE[$name]:-unknown}"
  local target="${SSH_USER}@${ip}"

  log "──────────────────────────────────────────────────────────"
  log "Updating: ${name}  (${ip})  role=${role}"

  if [ "$DRY_RUN" -eq 1 ]; then
    log "  [DRY-RUN] ssh ${target} → git pull && reprovision"
    return
  fi

  # Test SSH reachability first
  if ! ssh $SSH_OPTS -i "$SSH_KEY" "$target" "true" 2>/dev/null; then
    warn "  ${name} (${ip}) — SSH unreachable, skipping"
    return
  fi

  local pcmd
  pcmd="$(provision_cmd_for_role "$role")"

  # 1. Pull latest repo
  log "  Pulling latest ghostl-stack on ${name}..."
  ssh $SSH_OPTS -i "$SSH_KEY" "$target" "
    if [ -d '${REPO_DIR}/.git' ]; then
      sudo git -C '${REPO_DIR}' fetch --quiet origin main 2>&1 | tail -3 || true
      sudo git -C '${REPO_DIR}' reset --hard origin/main 2>&1 | tail -2 || true
    else
      sudo git clone --depth 1 '${REPO_URL}' '${REPO_DIR}' 2>&1 | tail -3
    fi
    echo 'repo updated'
  " 2>&1 | sed "s/^/  [${name}] /"

  # 2. Re-run provision script
  log "  Re-running provision (${role}) on ${name}..."
  ssh $SSH_OPTS -i "$SSH_KEY" "$target" "
    sudo bash -c 'set -e; ${pcmd}' 2>&1
  " 2>&1 | sed "s/^/  [${name}] /" || {
    warn "  Provision failed on ${name} — check logs above"
  }

  log "  ${name} update complete."
}

phase2_update_existing() {
  log "══════════════════════════════════════════════════════════════════"
  log "PHASE 2 — Updating existing running VMs"
  log "══════════════════════════════════════════════════════════════════"

  # Enumerate running VMs from libvirt
  mapfile -t RUNNING < <(virsh list --state-running --name 2>/dev/null | grep -v '^$' || true)

  if [ "${#RUNNING[@]}" -eq 0 ]; then
    log "No running VMs found — nothing to update."
    return
  fi

  log "Running VMs to update: ${RUNNING[*]}"
  echo ""

  for name in "${RUNNING[@]}"; do
    update_vm "$name"
  done

  log "Phase 2 complete."
}

# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────
log "═══════════════════════════════════════════════════════════════════════"
log "GhostChain Full Fleet Reprovision"
log "  NEW_ONLY=${NEW_ONLY}  UPDATE_ONLY=${UPDATE_ONLY}  DRY_RUN=${DRY_RUN}"
log "═══════════════════════════════════════════════════════════════════════"
echo ""

[ "$UPDATE_ONLY" -eq 0 ] && phase1_provision_new
[ "$NEW_ONLY"    -eq 0 ] && phase2_update_existing

echo ""
log "═══════════════════════════════════════════════════════════════════════"
log "All done."
log ""
log "VM status:"
virsh list --all 2>/dev/null || true
log ""
log "To monitor a specific VM:"
log "  sudo virsh console <vmname>"
log "  ssh ghost@<ip>"
log ""
log "To check cloud-init log on new VMs:"
log "  ssh ghost@10.50.99.20 'sudo journalctl -u cloud-final -f'"
