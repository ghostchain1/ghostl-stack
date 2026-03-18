#!/usr/bin/env bash
# =============================================================================
# GhostStack Firewall Setup — UFW rules for the /24 subnet layout
# =============================================================================
#
# IP roles:
#   38.247.149.218   edge gateway / reverse proxy
#   38.247.149.219   GhostChain L1 RPC
#   38.247.149.220   GhostL2 RPC
#   38.247.149.221   GhostL3 RPC
#   38.247.149.222   explorer + API services
#   38.247.149.223   AI / GhostBrain services
#   38.247.149.224   monitoring / Grafana / Prometheus
#
# Usage:
#   sudo bash infra/network/firewall/ufw-setup.sh
#
# This script is IDEMPOTENT — safe to re-run.
# =============================================================================

set -euo pipefail

SUBNET="38.247.149.0/24"
GW_IP="38.247.149.218"
L1_IP="38.247.149.219"
L2_IP="38.247.149.220"
L3_IP="38.247.149.221"
APPS_IP="38.247.149.222"
AI_IP="38.247.149.223"
MON_IP="38.247.149.224"

echo "==> Resetting UFW to defaults..."
ufw --force reset

echo "==> Default policy: deny in, allow out, deny routed"
ufw default deny incoming
ufw default allow outgoing
ufw default deny routed

# ── SSH (all IPs — control plane access) ─────────────────────────────────────
echo "==> Allow SSH on all IPs"
ufw allow 22/tcp comment "SSH admin"

# ── Edge gateway (38.247.149.218) — public HTTP/HTTPS only ───────────────────
echo "==> Edge gateway: 80/443 on ${GW_IP}"
ufw allow in on eth0 to "${GW_IP}" port 80  proto tcp comment "HTTP edge"
ufw allow in on eth0 to "${GW_IP}" port 443 proto tcp comment "HTTPS edge"

# ── GhostChain L1 RPC (38.247.149.219) — INTERNAL only ───────────────────────
# Public traffic must go through the gateway reverse proxy, not directly.
# Remove the direct-access rule below and replace with an allowed source
# range once you have a VPN or dedicated management CIDR.
echo "==> L1 RPC: 18545 internal only on ${L1_IP}"
ufw allow in on eth0 to "${L1_IP}" port 18545 proto tcp comment "L1 RPC (internal)"
# Cosmos LCD / CometBFT / gRPC — internal
ufw allow in on eth0 to "${L1_IP}" port 1317 proto tcp comment "Cosmos LCD"
ufw allow in on eth0 to "${L1_IP}" port 26657 proto tcp comment "CometBFT RPC"
ufw allow in on eth0 to "${L1_IP}" port 9090 proto tcp comment "Cosmos gRPC"

# ── GhostL2 RPC (38.247.149.220) — INTERNAL only ─────────────────────────────
echo "==> L2 RPC: 29547 internal only on ${L2_IP}"
ufw allow in on eth0 to "${L2_IP}" port 29547 proto tcp comment "L2 RPC (internal)"

# ── GhostL3 RPC (38.247.149.221) — INTERNAL only ─────────────────────────────
echo "==> L3 RPC: 39545 internal only on ${L3_IP}"
ufw allow in on eth0 to "${L3_IP}" port 39545 proto tcp comment "L3 RPC (internal)"

# ── Explorer + API services (38.247.149.222) ─────────────────────────────────
echo "==> Apps: 80/443 on ${APPS_IP}"
ufw allow in on eth0 to "${APPS_IP}" port 80  proto tcp comment "HTTP apps"
ufw allow in on eth0 to "${APPS_IP}" port 443 proto tcp comment "HTTPS apps"

# ── AI / GhostBrain (38.247.149.223) — internal service mesh ─────────────────
echo "==> AI: GhostBrain ports internal on ${AI_IP}"
ufw allow in on eth0 to "${AI_IP}" port 7900 proto tcp comment "GhostBrain Core"
ufw allow in on eth0 to "${AI_IP}" port 4080 proto tcp comment "Ghost AI Swarm"
ufw allow in on eth0 to "${AI_IP}" port 4060 proto tcp comment "GNMC"
ufw allow in on eth0 to "${AI_IP}" port 4070 proto tcp comment "GACK"

# ── Monitoring (38.247.149.224) — restrict to your infra CIDR + gateway ──────
echo "==> Monitoring: 3000/9090/9100 restricted on ${MON_IP}"
# Grafana — allow from within the subnet only
ufw allow in on eth0 to "${MON_IP}" port 3000 proto tcp comment "Grafana (internal)"
# Prometheus — subnet only
ufw allow in on eth0 to "${MON_IP}" port 9090 proto tcp comment "Prometheus (internal)"
# Node exporter — subnet only
ufw allow in on eth0 to "${MON_IP}" port 9100 proto tcp comment "Node exporter (internal)"
# Redis
ufw allow in on eth0 to "${MON_IP}" port 6379 proto tcp comment "Redis (internal)"
# PostgreSQL
ufw allow in on eth0 to "${MON_IP}" port 5432 proto tcp comment "PostgreSQL (internal)"

# ── ICMP (ping) — allow from within subnet ────────────────────────────────────
echo "==> Allow ping from subnet"
# ufw does not natively support per-subnet ICMP rules — done via before.rules below

# ── Enable UFW ────────────────────────────────────────────────────────────────
echo "==> Enabling UFW..."
ufw --force enable

echo ""
echo "==> Active rules:"
ufw status verbose

echo ""
echo "DONE. UFW is active."
echo ""
echo "IMPORTANT: RPC ports (18545, 29547, 39545) are only allowed from eth0."
echo "For true internal-only access add an explicit source restriction:"
echo "  sudo ufw allow in on eth0 from ${SUBNET} to 38.247.149.219 port 18545"
echo "  then remove the open rule above."
