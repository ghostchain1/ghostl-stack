# =============================================================================
# SSL automation — Certbot / Let's Encrypt for all GhostStack domains
# =============================================================================
#
# Usage:
#   sudo bash infra/network/ssl/certbot-setup.sh
#
# Prerequisites:
#   - DNS for all domains must point to 38.247.149.218 BEFORE running this
#   - Nginx must be running (port 80 needs to answer for ACME challenge)
#   - apt install certbot python3-certbot-nginx
# =============================================================================

set -euo pipefail

EMAIL="admin@ghostchain.cloud"

DOMAINS=(
  "rpc.ghostchain.cloud"
  "l2.ghostchain.cloud"
  "l3.ghostchain.cloud"
  "api.ghostchain.cloud"
  "ai.ghostchain.cloud"
  "brain.ghostchain.cloud"
  "grafana.ghostchain.cloud"
  "metrics.ghostchain.cloud"
  "status.ghostchain.cloud"
  "explorer.ghostchain.world"
  "wallet.ghostchain.world"
  # Geo-distributed RPC endpoints
  "rpc-us.ghostchain.cloud"
  "rpc-eu.ghostchain.cloud"
  "rpc-asia.ghostchain.cloud"
  "l2-us.ghostchain.cloud"
  "l2-eu.ghostchain.cloud"
  "l2-asia.ghostchain.cloud"
  "l3-us.ghostchain.cloud"
  "l3-eu.ghostchain.cloud"
  "l3-asia.ghostchain.cloud"
)

for domain in "${DOMAINS[@]}"; do
  echo "==> Issuing cert for ${domain}..."
  certbot certonly \
    --nginx \
    --non-interactive \
    --agree-tos \
    --email "${EMAIL}" \
    -d "${domain}"
done

echo ""
echo "==> Setting up auto-renewal cron..."
if ! crontab -l 2>/dev/null | grep -q "certbot renew"; then
  (crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet --nginx && systemctl reload nginx") | crontab -
  echo "    Renewal cron added."
else
  echo "    Renewal cron already present."
fi

echo ""
echo "DONE. All certificates issued. Test renewal:"
echo "  sudo certbot renew --dry-run"
