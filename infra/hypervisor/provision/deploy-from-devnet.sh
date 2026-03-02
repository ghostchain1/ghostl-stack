#!/usr/bin/env bash
# ==============================================================================
# GhostStack — deploy-from-devnet.sh
# Runs on this ghostchain-devnet VM (192.168.122.205).
# Assumes the hypervisor at 192.168.122.1 has already authorized our SSH key
# via hypervisor-authorize.sh.
#
# What this does:
#   1. Verifies SSH access to the hypervisor
#   2. Rsyncs this repo to the hypervisor
#   3. Runs provision-all-vms.sh on the hypervisor (which then SSHes into each
#      chain VM, registers DHCP leases, and provisions each node)
#
# Usage:
#   bash infra/hypervisor/provision/deploy-from-devnet.sh [--dry-run]
# ==============================================================================
set -euo pipefail

HYPERVISOR="192.168.122.1"
HV_USER="ghost"
SSH_KEY="$HOME/.ssh/id_ed25519"
REPO_ROOT="/home/ghost/ghostl-stack"
HV_REPO="/opt/ghostl-stack"

DRY_RUN=""
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN="--dry-run"

SSH_OPTS=(
  -o StrictHostKeyChecking=accept-new
  -o ConnectTimeout=10
  -o BatchMode=yes
  -o ForwardAgent=yes
  -i "$SSH_KEY"
)

log()  { echo -e "[deploy] $(date '+%H:%M:%S')  $*"; }
ok()   { echo -e "[deploy] \033[32m✓ $*\033[0m"; }
warn() { echo -e "[deploy] \033[33m⚠ $*\033[0m"; }
die()  { echo -e "[deploy] \033[31mERROR: $*\033[0m" >&2; exit 1; }

# ── Step 0: Load key into SSH agent (enables ForwardAgent to chain VMs) ──────
log "Loading SSH key into agent..."
eval "$(ssh-agent -s)" >/dev/null 2>&1 || true
ssh-add "$SSH_KEY" 2>/dev/null && ok "Key loaded into agent." || warn "ssh-add failed — agent forwarding may not work."

# ── Step 1: Verify hypervisor SSH ────────────────────────────────────────────
log "Testing SSH to hypervisor (${HYPERVISOR})..."
ssh "${SSH_OPTS[@]}" "${HV_USER}@${HYPERVISOR}" 'echo "SSH OK: $(id) @ $(hostname)"' \
  || die "Cannot SSH to hypervisor. Run infra/hypervisor/provision/hypervisor-authorize.sh on the hypervisor first."
ok "Hypervisor SSH accessible."

# ── Step 2: Verify virsh is available on hypervisor ──────────────────────────
log "Checking hypervisor virsh..."
ssh "${SSH_OPTS[@]}" "${HV_USER}@${HYPERVISOR}" 'virsh list --all' \
  || die "virsh not working on hypervisor. Ensure libvirt is installed and ${HV_USER} is in the libvirt group."
ok "virsh functional on hypervisor."

# ── Step 3: Rsync repo to hypervisor ─────────────────────────────────────────
log "Ensuring ${HV_REPO} exists on hypervisor..."
ssh "${SSH_OPTS[@]}" "${HV_USER}@${HYPERVISOR}" \
  "sudo install -d -o ${HV_USER} -g ${HV_USER} -m 755 ${HV_REPO}"
ok "${HV_REPO} ready."

log "Syncing repo to hypervisor:${HV_REPO} ..."
rsync -az --delete --progress \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.pnpm-store' \
  --exclude='infra/ghostchain/data' \
  --exclude='infra/opstack/data' \
  --exclude='infra/hypervisor/logs' \
  --exclude='infra/hypervisor/networks' \
  -e "ssh ${SSH_OPTS[*]}" \
  "${REPO_ROOT}/" \
  "${HV_USER}@${HYPERVISOR}:${HV_REPO}/"
ok "Repo synced to hypervisor."

# ── Step 4: Ensure provision scripts are executable on hypervisor ────────────
ssh "${SSH_OPTS[@]}" "${HV_USER}@${HYPERVISOR}" \
  "chmod +x ${HV_REPO}/infra/hypervisor/provision/*.sh"

# ── Step 5: Run provision-all-vms.sh on the hypervisor ───────────────────────
log "Running provision-all-vms.sh on hypervisor${DRY_RUN:+ (DRY_RUN)}..."
ssh -t "${SSH_OPTS[@]}" "${HV_USER}@${HYPERVISOR}" \
  "cd ${HV_REPO} && sudo -E SSH_AUTH_SOCK=\$SSH_AUTH_SOCK bash infra/hypervisor/provision/provision-all-vms.sh ${DRY_RUN}"

ok "Deployment complete. Check logs on hypervisor at:"
log "  ${HV_REPO}/infra/hypervisor/logs/"
