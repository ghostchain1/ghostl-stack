#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR=/var/backups/ghostdns

latest() {
  ls -1t "$BACKUP_DIR"/$1.*.bak 2>/dev/null | head -n1 || true
}

restore_file() {
  local pattern="$1"
  local target="$2"
  local src
  src="$(latest "$pattern")"
  if [[ -n "$src" ]]; then
    cp "$src" "$target"
    echo "restored:$target"
  fi
}

restore_file named.conf.options /etc/bind/named.conf.options
restore_file named.conf.local /etc/bind/named.conf.local
restore_file daemon.json /etc/docker/daemon.json

if [[ -f /etc/bind/named.conf.options ]]; then
  named-checkconf
fi

systemctl restart bind9 || true
systemctl restart docker || true

echo "dns_rollback_complete"
