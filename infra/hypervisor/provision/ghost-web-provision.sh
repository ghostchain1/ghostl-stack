#!/usr/bin/env bash
# =============================================================
# GhostStack — ghost-web VM in-VM provision script
# Run inside the VM (as root or via sudo) to install/update
# the web stack. Idempotent — safe to re-run for updates.
#
# Usage:
#   On first boot: invoked automatically by cloud-init runcmd
#   For updates:   ssh ghost@10.50.99.10 'sudo bash /opt/ghostl-stack/infra/hypervisor/provision/ghost-web-provision.sh'
# =============================================================
set -euo pipefail

REPO_DIR="/opt/ghostl-stack"
ENV_FILE="/etc/ghostl-stack/web.env"
COMPOSE_FILE="${REPO_DIR}/infra/docker/docker-compose.web.yml"
SERVICE="ghostweb"
LOG_PREFIX="[ghost-web-provision]"

log()  { echo "${LOG_PREFIX} $*"; }
ok()   { echo "${LOG_PREFIX} ✓ $*"; }
warn() { echo "${LOG_PREFIX} ⚠ $*" >&2; }
die()  { echo "${LOG_PREFIX} ✗ $*" >&2; exit 1; }

# ── Preflight ─────────────────────────────────────────────────
[[ $EUID -eq 0 ]] || die "Must run as root (sudo bash $0)"
command -v docker >/dev/null 2>&1 || die "Docker not installed — run cloud-init first or install manually."
command -v git    >/dev/null 2>&1 || die "Git not installed."

# ── 1. Pull latest repo ────────────────────────────────────────
if [[ -d "${REPO_DIR}/.git" ]]; then
  log "Pulling latest from repo..."
  git -C "$REPO_DIR" pull --ff-only
  ok "Repo updated."
else
  log "Cloning ghostl-stack repo..."
  git clone --depth=1 https://github.com/ghostchain/ghostl-stack.git "$REPO_DIR"
  ok "Repo cloned to ${REPO_DIR}."
fi

# ── 2. Verify env file ─────────────────────────────────────────
if [[ ! -f "$ENV_FILE" ]]; then
  warn "Env file not found: ${ENV_FILE}"
  warn "Creating placeholder — you MUST fill in real secrets before services start."
  mkdir -p "$(dirname "$ENV_FILE")"
  cat > "$ENV_FILE" <<'EOF'
WEB_DOMAIN=ghostchain.cloud
NEXT_PUBLIC_BASE_DOMAIN=ghostchain.cloud
ACME_EMAIL=ops@ghostchain.cloud
NEXTAUTH_URL=https://app.ghostchain.cloud
NEXTAUTH_SECRET=CHANGE_ME
NEXT_KEYCLOAK_ID=CHANGE_ME
NEXT_KEYCLOAK_SECRET=CHANGE_ME
NEXT_KEYCLOAK_URL=https://auth.ghostchain.cloud/realms/ghostchain
NEXT_PUBLIC_API_URL=https://api.ghostchain.cloud
EOF
  chmod 600 "$ENV_FILE"
  warn "Edit ${ENV_FILE} with real secrets, then re-run this script."
fi

# Check for placeholder secrets
if grep -q "CHANGE_ME" "$ENV_FILE"; then
  warn "Placeholder secrets detected in ${ENV_FILE} — services may not function correctly."
fi

# ── 3. Pull / build Docker images ─────────────────────────────
log "Pulling Docker images for web stack..."
docker compose -f "$COMPOSE_FILE" pull --quiet || warn "Pull failed — will use cached images."
ok "Images ready."

# ── 4. Reload systemd and (re)start service ────────────────────
if systemctl is-enabled --quiet "${SERVICE}.service" 2>/dev/null; then
  log "Restarting ${SERVICE} systemd service..."
  systemctl daemon-reload
  systemctl restart "${SERVICE}.service"
  ok "${SERVICE} restarted."
else
  log "Starting stack via docker compose directly..."
  docker compose -f "$COMPOSE_FILE" up -d --remove-orphans
  ok "Stack started."
fi

# ── 5. Health probe (up to 30 s) ──────────────────────────────
log "Waiting for Traefik to come up (30 s timeout)..."
for i in $(seq 1 30); do
  if curl -sSo /dev/null -w "%{http_code}" http://localhost/ 2>/dev/null | grep -qE "^[23]"; then
    ok "HTTP endpoint responding — ghost-web is live."
    break
  fi
  [[ $i -eq 30 ]] && warn "HTTP probe timed out — check: docker compose -f ${COMPOSE_FILE} logs"
  sleep 1
done

# ── Done ──────────────────────────────────────────────────────
echo ""
ok "ghost-web provision complete."
log "  Logs:   docker compose -f ${COMPOSE_FILE} logs -f"
log "  Status: docker compose -f ${COMPOSE_FILE} ps"
log "  Env:    ${ENV_FILE}"
