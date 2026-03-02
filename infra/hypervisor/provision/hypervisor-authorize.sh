#!/usr/bin/env bash
# ==============================================================================
# GhostStack — hypervisor-authorize.sh
# Run this ONCE on the HYPERVISOR (as root or the ghost user with sudo) to:
#   1. Authorize the ghostchain-devnet VM's SSH key on this hypervisor
#   2. Install the same key under /root/.ssh so provision-all-vms.sh
#      (which runs as sudo) can SSH into chain VMs
#   3. Add ghost user to the libvirt group (needed for virsh without root)
#
# One-liner to run on the hypervisor:
#   curl -fsSL https://raw.githubusercontent.com/ghostchain1/ghostl-stack/main/infra/hypervisor/provision/hypervisor-authorize.sh | sudo bash
#   — OR paste this whole file into your hypervisor terminal.
# ==============================================================================
set -euo pipefail

DEVNET_PUBKEY="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIF+osgEYoqPCDiJESBGJhdbM2EI+CcQr4UIC4igDX1Xu ghosttoken.dev@gmail.com"

log()  { echo "[hypervisor-authorize] $*"; }
ok()   { echo "[hypervisor-authorize] ✓ $*"; }

# ── 1. Authorize key for ghost user ──────────────────────────────────────────
log "Authorizing devnet VM SSH key for ghost user..."
GHOST_HOME="$(getent passwd ghost | cut -d: -f6 2>/dev/null || echo /home/ghost)"
mkdir -p "${GHOST_HOME}/.ssh"
chmod 700 "${GHOST_HOME}/.ssh"
touch "${GHOST_HOME}/.ssh/authorized_keys"
chmod 600 "${GHOST_HOME}/.ssh/authorized_keys"

if ! grep -qF "$DEVNET_PUBKEY" "${GHOST_HOME}/.ssh/authorized_keys" 2>/dev/null; then
  echo "$DEVNET_PUBKEY" >> "${GHOST_HOME}/.ssh/authorized_keys"
  ok "Key added to ${GHOST_HOME}/.ssh/authorized_keys"
else
  ok "Key already present in ${GHOST_HOME}/.ssh/authorized_keys"
fi
chown -R ghost:ghost "${GHOST_HOME}/.ssh" 2>/dev/null || true

# ── 2. Authorize key for root (needed when provision-all-vms.sh runs sudo) ───
log "Authorizing devnet VM SSH key for root..."
mkdir -p /root/.ssh
chmod 700 /root/.ssh
touch /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys

if ! grep -qF "$DEVNET_PUBKEY" /root/.ssh/authorized_keys 2>/dev/null; then
  echo "$DEVNET_PUBKEY" >> /root/.ssh/authorized_keys
  ok "Key added to /root/.ssh/authorized_keys"
else
  ok "Key already present in /root/.ssh/authorized_keys"
fi

# ── 3. Add ghost to libvirt group ────────────────────────────────────────────
if getent group libvirt >/dev/null 2>&1; then
  if ! id -nG ghost 2>/dev/null | grep -qw libvirt; then
    usermod -aG libvirt ghost
    ok "ghost added to libvirt group (re-login required for group to take effect)"
  else
    ok "ghost already in libvirt group"
  fi
else
  echo "[hypervisor-authorize] libvirt group not found — libvirt may not be installed yet."
  echo "[hypervisor-authorize] Run the bootstrap first: sudo bash infra/hypervisor/ghoststack_bootstrap.sh"
fi

# ── 4. Ensure sshd permits the key ───────────────────────────────────────────
# Some hardened configs disable pubkey auth — ensure it's on.
if grep -qE '^#?PubkeyAuthentication' /etc/ssh/sshd_config 2>/dev/null; then
  sed -i 's/^#\?PubkeyAuthentication.*/PubkeyAuthentication yes/' /etc/ssh/sshd_config
  systemctl reload sshd 2>/dev/null || systemctl reload ssh 2>/dev/null || true
  ok "PubkeyAuthentication enabled in sshd_config"
fi

echo ""
echo "========================================================"
ok "Hypervisor authorized for ghostchain-devnet VM."
echo ""
echo "Next: From the ghostchain-devnet VM (192.168.122.205) run:"
echo ""
echo "  cd /home/ghost/ghostl-stack"
echo "  bash infra/hypervisor/provision/deploy-from-devnet.sh"
echo "========================================================"
