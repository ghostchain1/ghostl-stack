#!/usr/bin/env bash
set -euo pipefail

PUBLIC_SRC_IP="$(ip -4 route get 1.1.1.1 | awk '/src/ {for(i=1;i<=NF;i++) if($i=="src") {print $(i+1); exit}}')"
DEFAULT_GW="$(ip route | awk '/default/ {print $3; exit}')"

printf 'public_src_ip=%s\n' "$PUBLIC_SRC_IP"
printf 'default_gateway=%s\n' "$DEFAULT_GW"
printf 'bridges=\n'
ip -4 -o addr show | awk '{print $2" "$4}' | grep -E 'docker0|virbr|br-' || true

printf 'dns_listeners=\n'
ss -luntp | grep -E ':(53)\s' || true
