#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
BACKUP_DIR=/var/backups/ghostdns
TS="$(date -u +%Y%m%dT%H%M%SZ)"

mkdir -p "$BACKUP_DIR" /etc/bind/zones /var/log/named

apt-get update
apt-get install -y bind9 bind9utils dnsutils fail2ban

for file in /etc/bind/named.conf.options /etc/bind/named.conf.local /etc/bind/named.conf; do
  [[ -f "$file" ]] && cp "$file" "$BACKUP_DIR/$(basename "$file").$TS.bak"
done

cp "$ROOT_DIR/infra/dns/bind/named.conf.options" /etc/bind/named.conf.options
cp "$ROOT_DIR/infra/dns/bind/named.conf.local" /etc/bind/named.conf.local
cp "$ROOT_DIR/infra/dns/bind/db.ghostchain.cloud" /etc/bind/zones/db.ghostchain.cloud

if ! grep -q 'named.conf.logging' /etc/bind/named.conf; then
  echo 'include "/etc/bind/named.conf.logging";' >> /etc/bind/named.conf
fi
cp "$ROOT_DIR/infra/dns/bind/named.conf.logging" /etc/bind/named.conf.logging

cp "$ROOT_DIR/infra/dns/fail2ban/filter.d/ghostdns-named.conf" /etc/fail2ban/filter.d/ghostdns-named.conf
cp "$ROOT_DIR/infra/dns/fail2ban/jail.d/ghostdns-named.conf" /etc/fail2ban/jail.d/ghostdns-named.conf

chown bind:bind /etc/bind/zones/db.ghostchain.cloud
chmod 640 /etc/bind/zones/db.ghostchain.cloud

named-checkconf
named-checkzone ghostchain.cloud /etc/bind/zones/db.ghostchain.cloud

systemctl enable --now bind9
systemctl restart fail2ban

if command -v ufw >/dev/null 2>&1; then
  ufw allow 53/tcp || true
  ufw allow 53/udp || true
fi

echo "bind9_installation_complete"
