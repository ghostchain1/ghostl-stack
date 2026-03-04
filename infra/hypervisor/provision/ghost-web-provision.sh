#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ghost-web-provision.sh
# Idempotent provision script for the ghost-web KVM testnet VM.
# Called by cloud-init on first boot, or re-run manually to update the VM.
#
# Usage (manual):  sudo bash ghost-web-provision.sh [--update]
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/ghostchain1/ghostl-stack.git}"
REPO_DIR="${REPO_DIR:-/opt/ghostl-stack}"
ENV_FILE="${ENV_FILE:-/etc/ghostl-stack/web.env}"
UPDATE="${1:-}"

log() { echo "[ghost-web-provision] $(date -u +%H:%M:%SZ) $*"; }

# ── 1. Docker ──────────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  log "Installing Docker Engine..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
  usermod -aG docker ghost
else
  log "Docker already installed ($(docker --version))"
fi

# ── 2. Repo ────────────────────────────────────────────────────────────────
if [ -d "$REPO_DIR/.git" ]; then
  log "Updating repo at $REPO_DIR..."
  git -C "$REPO_DIR" fetch --depth=1 origin main
  git -C "$REPO_DIR" reset --hard origin/main
else
  log "Cloning repo to $REPO_DIR..."
  git clone --depth=1 "$REPO_URL" "$REPO_DIR"
fi
chown -R ghost:ghost "$REPO_DIR"

# ── 3. web.env ─────────────────────────────────────────────────────────────
# Do NOT overwrite existing secrets – only set if the file is missing or
# the caller explicitly passes --update.
mkdir -p /etc/ghostl-stack

if [ ! -f "$ENV_FILE" ] || [ "$UPDATE" = "--update" ]; then
  log "Writing $ENV_FILE..."
  cat > "$ENV_FILE" <<'WEBENV'
# ghost-web testnet overlay — managed by ghost-web-provision.sh
# All values here are non-secret testnet defaults; override via Vault.

WEB_DOMAIN=ghostchain.cloud
NEXT_PUBLIC_BASE_DOMAIN=ghostchain.cloud
ACME_EMAIL=ops@ghostchain.cloud

# ── Testnet chain endpoints (host-relative from inside the VM) ──────────────
NEXT_PUBLIC_L1_RPC=http://10.50.99.1:18545
NEXT_PUBLIC_L2_RPC=http://10.50.99.1:29547
NEXT_PUBLIC_L3_RPC=http://10.50.99.1:39545
NEXT_PUBLIC_L1_CHAIN_ID=14000101
NEXT_PUBLIC_L2_CHAIN_ID=901
NEXT_PUBLIC_L3_CHAIN_ID=903

# ── Ghost Guard / AI ────────────────────────────────────────────────────────
NEXT_PUBLIC_GHOST_GUARD_URL=http://10.50.99.1:7070
NEXT_PUBLIC_AI_CONSENSUS_URL=http://10.50.99.1:17715

# ── Auth (Keycloak) ─────────────────────────────────────────────────────────
NEXTAUTH_URL=https://app.ghostchain.cloud
NEXTAUTH_SECRET=REPLACE_WITH_STRONG_RANDOM_SECRET
NEXT_KEYCLOAK_ID=REPLACE_WITH_CLIENT_ID
NEXT_KEYCLOAK_SECRET=REPLACE_WITH_CLIENT_SECRET
NEXT_KEYCLOAK_URL=https://auth.ghostchain.cloud/realms/ghostchain

# ── API ─────────────────────────────────────────────────────────────────────
NEXT_PUBLIC_API_URL=https://api.ghostchain.cloud
HOST_API_URL=http://10.50.99.1:3001

# ── Contract addresses (ghostl2 testnet deployment) ─────────────────────────
NEXT_PUBLIC_L2_OUTPUT_ORACLE=0x8198f5d8F8CfFE8f9C413d98a0A55aEB8ab9FbB7
NEXT_PUBLIC_BRIDGE_L2L3=0xE6E340D132b5f46d1e472DebcD681B2aBc16e57E
NEXT_PUBLIC_L3_INBOX=0xD0141E899a65C95a556fE2B27e5982A6DE7fDD7A
NEXT_PUBLIC_L3_TOKEN_FACTORY=0x07882Ae1ecB7429a84f1D53048d35c4bB2056877
NEXT_PUBLIC_GOVERNOR_L1=0xfbC22278A96299D91d41C453234d97b4F5Eb9B2d
NEXT_PUBLIC_GAS_TOKEN=0x5FbDB2315678afecb367f032d93F642f64180aa3

# ── Compliance ──────────────────────────────────────────────────────────────
NEXT_PUBLIC_COMPLIANCE_URL=http://10.50.99.1:8090
WEBENV
  chmod 600 "$ENV_FILE"
  log "web.env written."
else
  log "web.env already exists — skipping (use --update to overwrite)"
fi

# ── 4. Systemd service ─────────────────────────────────────────────────────
COMPOSE_FILE="$REPO_DIR/infra/docker/docker-compose.web.yml"

# Fallback: if the web-specific compose doesn't exist, use the apps compose
if [ ! -f "$COMPOSE_FILE" ]; then
  COMPOSE_FILE="$REPO_DIR/apps/docker-compose.yml"
fi

log "Configuring ghostweb systemd service..."
cat > /etc/systemd/system/ghostweb.service <<SERVICE
[Unit]
Description=GhostStack Web Frontend (Traefik + Next.js)
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$REPO_DIR
EnvironmentFile=$ENV_FILE
ExecStart=/usr/bin/docker compose -f $COMPOSE_FILE --env-file $ENV_FILE up --remove-orphans
ExecStop=/usr/bin/docker compose -f $COMPOSE_FILE down
Restart=always
RestartSec=15
StandardOutput=journal
StandardError=journal
SyslogIdentifier=ghostweb

[Install]
WantedBy=multi-user.target
SERVICE

# ── 5. Health check ────────────────────────────────────────────────────────
cat > /usr/local/bin/ghostweb-health <<'HEALTH'
#!/usr/bin/env bash
HTTP_CODE=$(curl -sSo /dev/null -w "%{http_code}" http://localhost/ 2>/dev/null)
if echo "$HTTP_CODE" | grep -qE "^[23]"; then
  echo "ghostweb OK (HTTP ${HTTP_CODE})"
  exit 0
else
  echo "ghostweb UNHEALTHY (HTTP ${HTTP_CODE:-timeout})" >&2
  exit 1
fi
HEALTH
chmod +x /usr/local/bin/ghostweb-health

# ── 6. Health timer ────────────────────────────────────────────────────────
cat > /etc/systemd/system/ghostweb-health.service <<HSVC
[Unit]
Description=GhostWeb health check
After=ghostweb.service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/ghostweb-health
HSVC

cat > /etc/systemd/system/ghostweb-health.timer <<HTIMER
[Unit]
Description=Run GhostWeb health check every minute
After=ghostweb.service

[Timer]
OnBootSec=120
OnUnitActiveSec=60
Unit=ghostweb-health.service

[Install]
WantedBy=timers.target
HTIMER

# ── 7. Reload + enable ────────────────────────────────────────────────────
systemctl daemon-reload
systemctl enable ghostweb.service
systemctl enable ghostweb-health.timer

log "Provision complete."
log "  VM IP : 10.50.99.10"
log "  Service: sudo journalctl -u ghostweb -f"
log "  Health : sudo systemctl status ghostweb-health"
