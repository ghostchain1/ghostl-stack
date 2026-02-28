#!/usr/bin/env bash
set -euo pipefail

mkdir -p /app/state/last_good /tmp/bind /tmp/bind/cache /tmp/bind/zones

cp /app/config/named.conf.options.template /tmp/bind/named.conf.options
cp /app/config/named.conf.local.template /tmp/bind/named.conf.local
cp /app/config/db.ghostchain.cloud.template /tmp/bind/zones/db.ghostchain.cloud

sed -i 's#{{RECURSION_CIDRS}}#  127.0.0.0/8;#' /tmp/bind/named.conf.options
sed -i 's#{{UPSTREAM_DNS}}#    1.1.1.1;\n    8.8.8.8;#' /tmp/bind/named.conf.options
sed -i 's#{{BIND_LISTEN_IPV4}}#any#' /tmp/bind/named.conf.options
sed -i 's#/etc/bind/zones#/tmp/bind/zones#g' /tmp/bind/named.conf.local

cat >/tmp/bind/named.conf <<'EOF'
include "/tmp/bind/named.conf.options";
include "/tmp/bind/named.conf.local";
controls { };
EOF

export GHOSTDNS_BIND_ETC=/tmp/bind

named -g -c /tmp/bind/named.conf &
NAMED_PID=$!

python3 -m uvicorn src.main:app --host 0.0.0.0 --port 8089 &
API_PID=$!

_term() {
  kill -TERM "$API_PID" "$NAMED_PID" 2>/dev/null || true
  wait "$API_PID" "$NAMED_PID" 2>/dev/null || true
}
trap _term TERM INT

wait -n "$API_PID" "$NAMED_PID"
EXIT_CODE=$?
_term
exit "$EXIT_CODE"
