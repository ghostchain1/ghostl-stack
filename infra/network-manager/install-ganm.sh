#!/usr/bin/env bash
# install-ganm.sh — Install and enable the GhostChain Autonomous Network Manager
# Run as root (or with sudo) on the host machine.
set -euo pipefail

GANM_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_NAME="ghost-network-manager"
SERVICE_FILE="${GANM_DIR}/${SERVICE_NAME}.service"
SYSTEMD_DIR="/etc/systemd/system"
LOG_DIR="/var/log/ghostchain"
CONF_DIR="/etc/ghostchain"

echo "=== GANM Installer ==="
echo "Source: ${GANM_DIR}"

# Verify running as root
if [[ $EUID -ne 0 ]]; then
  echo "ERROR: Run with sudo or as root." >&2
  exit 1
fi

# Create log + config dirs
mkdir -p "${LOG_DIR}" "${CONF_DIR}"
chown ghost:ghost "${LOG_DIR}" 2>/dev/null || true

# Install Python deps (stdlib only, psutil optional)
if command -v pip3 &>/dev/null; then
  echo "Installing Python requirements..."
  pip3 install -q -r "${GANM_DIR}/requirements.txt" || echo "WARN: pip install failed; stdlib fallback active"
fi

# Create env override file if it doesn't exist
if [[ ! -f "${CONF_DIR}/ganm.env" ]]; then
  echo "Creating ${CONF_DIR}/ganm.env (edit to override defaults)"
  cat > "${CONF_DIR}/ganm.env" <<'EOF'
# GANM site-local overrides — edit as needed
# GHOSTBRAIN_URL=http://localhost:7900
# SIGNING_RELAY_URL=http://localhost:7910
# GANM_AGENT_ID=ghost-autonomous-network-manager
# GHOSTBRAIN_HTTP_TIMEOUT=5

# GhostBrain HMAC auth — set in production
# CONTROL_PLANE_HMAC_SECRET=<your-secret-here>

# Tune intervals
# PROBE_INTERVAL_S=15
# CONFLICT_INTERVAL_S=10
# GHOSTBRAIN_POLL_INTERVAL_S=30

# 0=live, 1=log-only (no kills, no plan commits)
# DRY_RUN=0

# AI risk threshold above which eviction triggers (0.0-1.0)
# AI_SCORE_THRESHOLD=0.6

# 1=require GhostBrain action plan approval before evicting
# EVICTION_NEEDS_PLAN=1

# LOG_LEVEL=INFO
# METRICS_PORT=9109
EOF
fi

# Copy systemd unit
echo "Installing systemd unit → ${SYSTEMD_DIR}/${SERVICE_NAME}.service"
cp "${SERVICE_FILE}" "${SYSTEMD_DIR}/${SERVICE_NAME}.service"
chmod 644 "${SYSTEMD_DIR}/${SERVICE_NAME}.service"

# Reload systemd, enable, start
systemctl daemon-reload
systemctl enable "${SERVICE_NAME}.service"
echo "Enabled ${SERVICE_NAME} (will start at boot)"

# Start now
if systemctl start "${SERVICE_NAME}.service"; then
  echo "Started ${SERVICE_NAME}"
  sleep 2
  systemctl status "${SERVICE_NAME}.service" --no-pager -l || true
else
  echo "WARN: Service did not start immediately — check logs:"
  echo "  journalctl -u ${SERVICE_NAME} -n 50"
fi

echo ""
echo "=== GANM installed and running ==="
echo "  Metrics:    http://localhost:9109/metrics"
echo "  Status API: http://localhost:9110/status"
echo "  Logs:       journalctl -u ${SERVICE_NAME} -f"
echo "  Config:     ${CONF_DIR}/ganm.env"
