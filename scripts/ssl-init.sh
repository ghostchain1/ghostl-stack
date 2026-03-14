#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# GhostChain — SSL / TLS Initialization Script
#
# Obtains Let's Encrypt certificates for all 11 production domains + api.*
# subdomains. Uses HTTP-01 (webroot) challenge; nginx must be running first
# with the HTTP server blocks in place.
#
# Usage (run as root after nginx is up):
#   sudo bash scripts/ssl-init.sh [--dry-run] [--force-renew]
#
# Environment / prerequisites:
#   - nginx serving /.well-known/acme-challenge/ from /var/www/letsencrypt
#   - All domain DNS A-records must already point to their respective IPs
#   - Port 80 open on all 7 IPs
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

# ── Constants ─────────────────────────────────────────────────────────────────
WEBROOT="/var/www/letsencrypt"
SSL_DIR="/etc/nginx/ssl"
DHPARAM="${SSL_DIR}/dhparam.pem"
EMAIL="${LETSENCRYPT_EMAIL:-admin@ghostchain.cloud}"
CERTBOT_OPTS="--webroot --webroot-path ${WEBROOT} --non-interactive --agree-tos --email ${EMAIL}"
DRY_RUN=false
FORCE_RENEW=false

# ── Argument handling ─────────────────────────────────────────────────────────
for arg in "$@"; do
  case "$arg" in
    --dry-run)     DRY_RUN=true ;  CERTBOT_OPTS="${CERTBOT_OPTS} --dry-run" ;;
    --force-renew) FORCE_RENEW=true ; CERTBOT_OPTS="${CERTBOT_OPTS} --force-renewal" ;;
  esac
done

log() { echo "[ssl-init] $(date '+%H:%M:%S') $*"; }
warn() { echo "[ssl-init] WARN  $*" >&2; }
die()  { echo "[ssl-init] ERROR $*" >&2; exit 1; }

# ── Privilege check ───────────────────────────────────────────────────────────
[[ "$EUID" -ne 0 ]] && die "Must be run as root (sudo bash $0)"

# ── Install certbot if not present ───────────────────────────────────────────
if ! command -v certbot &>/dev/null; then
  log "Installing certbot..."
  apt-get update -qq
  apt-get install -y -qq certbot python3-certbot-nginx
  log "certbot installed: $(certbot --version 2>&1)"
fi

# ── Create webroot and SSL dirs ───────────────────────────────────────────────
mkdir -p "${WEBROOT}" "${SSL_DIR}"

# ── Generate DH parameters (skip if already exists) ──────────────────────────
if [[ ! -f "${DHPARAM}" ]]; then
  if [[ "${DRY_RUN}" == "true" ]]; then
    log "[DRY-RUN] Would generate dhparam.pem (4096-bit) — skipping"
    # Create a 2048-bit placeholder for dry-run only
    openssl dhparam -out "${DHPARAM}" 2048 2>/dev/null
  else
    log "Generating DH parameters (4096-bit) — this may take several minutes..."
    openssl dhparam -out "${DHPARAM}" 4096
    log "DH parameters written to ${DHPARAM}"
  fi
else
  log "DH parameters already exist at ${DHPARAM}, skipping."
fi

# ── Certificate definitions ───────────────────────────────────────────────────
# Format: "cert-name|domain1 domain2 ..."
# The first domain in each list becomes the cert directory name.
declare -a CERTS=(
  "ghostchain.cloud|ghostchain.cloud ghostchain.world"
  "ghostchain.info|ghostchain.info ghostchain.online"
  "ghostchain.life|ghostchain.life ghostchain.live"
  "ghostchain.store|ghostchain.store"
  "ghostchain.space|ghostchain.space"
  "ghostchainlink.com|ghostchainlink.com ghostschain.com"
  "ghostchainsolutions.com|ghostchainsolutions.com"
  "api.ghostchain.cloud|api.ghostchain.cloud api.ghostchain.info api.ghostchain.life api.ghostchain.live api.ghostchain.online api.ghostchain.space api.ghostchain.store api.ghostchain.world api.ghostchainlink.com api.ghostchainsolutions.com api.ghostschain.com"
)

# ── Obtain / renew certificates ───────────────────────────────────────────────
for entry in "${CERTS[@]}"; do
  cert_name="${entry%%|*}"
  domains_str="${entry##*|}"

  # Build -d args
  d_args=()
  for d in $domains_str; do
    d_args+=("-d" "$d")
  done

  cert_path="/etc/letsencrypt/live/${cert_name}/fullchain.pem"
  if [[ -f "${cert_path}" && "${FORCE_RENEW}" == "false" && "${DRY_RUN}" == "false" ]]; then
    log "Certificate for ${cert_name} already exists — skipping (use --force-renew to re-issue)"
    continue
  fi

  log "Requesting certificate for: ${cert_name} [${domains_str}]"
  # shellcheck disable=SC2086
  certbot certonly ${CERTBOT_OPTS} \
    --cert-name "${cert_name}" \
    "${d_args[@]}" \
    || warn "certbot failed for ${cert_name} — check DNS and nginx config"
done

# ── Reload nginx to pick up new certs ────────────────────────────────────────
if [[ "${DRY_RUN}" == "false" ]]; then
  if systemctl is-active --quiet nginx; then
    log "Reloading nginx..."
    nginx -t && systemctl reload nginx
    log "nginx reloaded successfully."
  else
    warn "nginx is not running — start it with: sudo systemctl start nginx"
  fi
fi

# ── Configure automatic renewal (certbot timer via systemd) ──────────────────
if systemctl list-unit-files certbot.timer &>/dev/null; then
  systemctl enable --now certbot.timer
  log "certbot.timer enabled for automatic renewal."
else
  # Fallback: cron-based renewal (runs twice daily, as recommended)
  CRON_EXPR="0 2,14 * * *"
  CRON_CMD="${CRON_EXPR} root certbot renew --quiet --deploy-hook 'systemctl reload nginx'"
  CRON_FILE="/etc/cron.d/certbot-ghostchain"
  if [[ ! -f "${CRON_FILE}" ]]; then
    printf "# GhostChain Let's Encrypt auto-renewal\n%s\n" "${CRON_CMD}" > "${CRON_FILE}"
    chmod 0644 "${CRON_FILE}"
    log "Renewal cron installed at ${CRON_FILE}"
  else
    log "Renewal cron already exists at ${CRON_FILE}, skipping."
  fi
fi

# ── Summary ───────────────────────────────────────────────────────────────────
log ""
log "════════════════════════════════════════════════"
log "  SSL initialization complete"
[[ "${DRY_RUN}" == "true" ]] && log "  Mode: DRY RUN — no real certs issued"
log ""
log "  Certs stored under: /etc/letsencrypt/live/"
log "  DH params at:       ${DHPARAM}"
log "  Next: run scripts/deploy-production.sh to"
log "        enable HTTPS server blocks in nginx."
log "════════════════════════════════════════════════"
