#!/usr/bin/env bash
set -euo pipefail

ZONE_FILE="${1:-/etc/bind/zones/db.ghostchain.cloud}"

named-checkconf
named-checkzone ghostchain.cloud "$ZONE_FILE"

for host in l1.ghostchain.cloud l2.ghostchain.cloud l3.ghostchain.cloud hypervisor.ghostchain.cloud; do
  dig +short "$host" @127.0.0.1 || true
done

if docker ps >/dev/null 2>&1; then
  CID="$(docker ps -q | head -n1 || true)"
  if [[ -n "$CID" ]]; then
    docker exec "$CID" nslookup l1.ghostchain.cloud 127.0.0.1 || true
  fi
fi

echo "dns_verification_complete"
