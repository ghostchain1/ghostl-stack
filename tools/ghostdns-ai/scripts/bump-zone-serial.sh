#!/usr/bin/env bash
set -euo pipefail

ZONE_FILE="${1:-/etc/bind/zones/db.ghostchain.cloud}"

if [[ ! -f "$ZONE_FILE" ]]; then
  echo "zone_file_not_found:$ZONE_FILE" >&2
  exit 1
fi

current="$(grep -Eo '[0-9]{10}[[:space:]]*;[[:space:]]*serial' "$ZONE_FILE" | head -n1 | grep -Eo '[0-9]{10}')"
if [[ -z "$current" ]]; then
  echo "zone_serial_not_found" >&2
  exit 1
fi

today="$(date -u +%Y%m%d)"
if [[ "${current:0:8}" == "$today" ]]; then
  seq=$((10#${current:8:2} + 1))
else
  seq=1
fi
next="$(printf '%s%02d' "$today" "$seq")"

sed -i -E "0,/([0-9]{10})([[:space:]]*;[[:space:]]*serial)/s//${next}\2/" "$ZONE_FILE"
echo "serial_updated:$current->$next"
