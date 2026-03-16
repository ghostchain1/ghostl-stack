#!/usr/bin/env bash
# authorize-devnet-on-hypervisor.sh
#
# PURPOSE: Authorize ghostchain-devnet's SSH key on the KVM hypervisor so that:
#   • GAIS can manage VMs via  qemu+ssh://root@192.168.122.1/system
#   • virsh / ssh hypervisor   work from ghostchain-devnet without a password
#
# HOW TO RUN:
#   Copy this script to the hypervisor (192.168.122.1) and run it as root:
#
#     scp infra/hypervisor/provision/authorize-devnet-on-hypervisor.sh \
#         root@<hypervisor-console-ip>:/tmp/
#     ssh root@<hypervisor-console-ip> bash /tmp/authorize-devnet-on-hypervisor.sh
#
#   Or paste the one-liner at the bottom of this file directly into a root shell
#   on the hypervisor.
#
# REQUIREMENTS: Run AS ROOT on the KVM hypervisor (192.168.122.1).
#
set -euo pipefail

DEVNET_PUBKEY="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAID0A1QFwRq8ZG8hWvK2q7lZVO1a0b2IDU7sWDlFvlaNZ ghostchain-devnet→hypervisor"

log() { echo "[authorize-devnet] $(date -u +%T)Z  $*"; }

# ── root authorized_keys ────────────────────────────────────────────────────────
mkdir -p /root/.ssh
chmod 700 /root/.ssh
touch /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys

if grep -qF "$DEVNET_PUBKEY" /root/.ssh/authorized_keys 2>/dev/null; then
  log "Key already present in /root/.ssh/authorized_keys — nothing to do."
else
  echo "$DEVNET_PUBKEY" >> /root/.ssh/authorized_keys
  sort -u /root/.ssh/authorized_keys -o /root/.ssh/authorized_keys
  log "Key added to /root/.ssh/authorized_keys"
fi

# ── Verify SSH access from devnet ───────────────────────────────────────────────
log ""
log "Done.  From ghostchain-devnet run:"
log "  ssh hypervisor 'hostname && virsh list --all'"
log ""
log "Or test GAIS libvirt connection:"
log "  virsh -c 'qemu+ssh://root@192.168.122.1/system' list --all"
log ""

# ── ONE-LINER (paste directly on the hypervisor as root) ───────────────────────
#
# echo "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAID0A1QFwRq8ZG8hWvK2q7lZVO1a0b2IDU7sWDlFvlaNZ ghostchain-devnet→hypervisor" >> /root/.ssh/authorized_keys && sort -u /root/.ssh/authorized_keys -o /root/.ssh/authorized_keys && echo "OK"
#
