#!/usr/bin/env bash
# =============================================================
# GhostStack — ghostchain-vhdx-import-provision.sh
# Idempotent in-VM provisioner for the VHDX→QCOW2 import VM.
# Installs: qemu-utils, libguestfs-tools, helper scripts.
# No blockchain services run on this VM.
#
# Usage:
#   sudo bash ghostchain-vhdx-import-provision.sh
# =============================================================
set -euo pipefail

REPO_DIR="/opt/ghostl-stack"
WORK_DIR="/var/lib/vhdx-import"
LOG_PREFIX="[vhdx-import-provision]"

log()  { echo "${LOG_PREFIX} $*"; }
ok()   { echo "${LOG_PREFIX} ✓ $*"; }
warn() { echo "${LOG_PREFIX} ⚠ $*" >&2; }
die()  { echo "${LOG_PREFIX} ✗ $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Must run as root (sudo bash $0)"

# ── 1. Packages ───────────────────────────────────────────────
log "Installing VHDX conversion tools..."
apt-get update -y -q
apt-get install -y -q \
  qemu-utils \
  libguestfs-tools \
  ntfs-3g \
  pv \
  rsync \
  curl \
  git \
  jq
ok "Packages installed."

# ── 2. Clone / pull repo ──────────────────────────────────────
if [[ -d "${REPO_DIR}/.git" ]]; then
  log "Pulling latest from repo..."
  git -C "$REPO_DIR" pull --ff-only
  ok "Repo updated."
else
  git clone --depth=1 https://github.com/ghostchain1/ghostl-stack.git "$REPO_DIR"
  ok "Repo cloned."
fi

# ── 3. Work directory ─────────────────────────────────────────
mkdir -p "$WORK_DIR"
chown ghost:ghost "$WORK_DIR"
ok "Work directory ready: ${WORK_DIR}"

# ── 4. Helper scripts ─────────────────────────────────────────
install -m 755 /dev/stdin /usr/local/bin/vhdx-to-qcow2 <<'HELPER'
#!/usr/bin/env bash
# vhdx-to-qcow2 <source.vhdx> [dest.qcow2]
set -euo pipefail
SRC="${1:?Usage: vhdx-to-qcow2 <source.vhdx> [dest.qcow2]}"
DST="${2:-${SRC%.vhdx}.qcow2}"
echo "[vhdx-to-qcow2] Source : $SRC"
echo "[vhdx-to-qcow2] Dest   : $DST"
qemu-img convert -p -f vhdx -O qcow2 "$SRC" "$DST"
echo "[vhdx-to-qcow2] Done."
qemu-img info "$DST"
HELPER

install -m 755 /dev/stdin /usr/local/bin/vhdx-mount-inspect <<'HELPER'
#!/usr/bin/env bash
# vhdx-mount-inspect <image.vhdx|image.qcow2> [mountpoint]
set -euo pipefail
IMG="${1:?Usage: vhdx-mount-inspect <image> [mountpoint]}"
MNT="${2:-/mnt/vhdx-inspect}"
mkdir -p "$MNT"
guestmount -a "$IMG" -i --ro "$MNT"
echo "[inspect] Mounted at $MNT"
ls -la "$MNT"
echo "[inspect] Unmount with: guestunmount $MNT"
HELPER

ok "Helper scripts installed: vhdx-to-qcow2, vhdx-mount-inspect"

# ── 5. Test qemu-img is functional ────────────────────────────
qemu-img --version | head -1
ok "qemu-img functional."

echo ""
echo "============================================================"
echo " ghostchain-vhdx-import VM provisioned."
echo ""
echo " Usage:"
echo "   vhdx-to-qcow2 /var/lib/vhdx-import/disk.vhdx"
echo "   vhdx-mount-inspect /var/lib/vhdx-import/disk.qcow2"
echo ""
echo " Work dir:  ${WORK_DIR}"
echo " No chain services run on this VM."
echo "============================================================"
