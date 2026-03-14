#!/bin/bash
# install-systemd.sh — installs GhostStack systemd services
# Run as root: sudo ./system/systemd/install-systemd.sh

set -euo pipefail

SYSTEMD_DIR="/etc/systemd/system"
UNITS_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Installing GhostStack systemd units..."

for unit in ghostbrain ghostchain ghoststack-monitoring; do
    src="${UNITS_DIR}/${unit}.service"
    dst="${SYSTEMD_DIR}/${unit}.service"
    if [[ -f "$src" ]]; then
        cp "$src" "$dst"
        systemctl daemon-reload
        systemctl enable "${unit}.service"
        echo "  ✓ ${unit}.service installed and enabled"
    else
        echo "  ✗ ${src} not found — skipping"
    fi
done

echo ""
echo "Start with:  sudo systemctl start ghostbrain ghostchain ghoststack-monitoring"
echo "Status:      sudo systemctl status ghostbrain"
