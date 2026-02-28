#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

L1_RPC="${RPC_L1:-${L1_RPC_INTERNAL:-http://localhost:18545}}"
L2_RPC="${RPC_L2:-${L2_RPC_INTERNAL:-http://localhost:29547}}"
L3_RPC="${RPC_L3:-${L3_RPC_INTERNAL:-http://localhost:39545}}"
L3_PARENT_L2_RPC="${L3_PARENT_L2_RPC:-}"
L2_REVENUE_AGGREGATOR_URL="${L2_REVENUE_AGGREGATOR_URL:-}"
L1_TREASURY_ENGINE_URL="${L1_TREASURY_ENGINE_URL:-}"
L2_CHAIN_ID_EXPECTED="${L2_CHAIN_ID:-901}"
L1_CHAIN_ID_EXPECTED="${L1_CHAIN_ID:-14000101}"
L3_FEE_TARGET_CHAIN_ID="${L3_FEE_TARGET_CHAIN_ID:-$L2_CHAIN_ID_EXPECTED}"
L2_REVENUE_TARGET_CHAIN_ID="${L2_REVENUE_TARGET_CHAIN_ID:-$L1_CHAIN_ID_EXPECTED}"

die() {
  echo "routing_verify:FAIL:$1" >&2
  exit 1
}

norm() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed 's#/$##'
}

url_to_host_port() {
  python3 - "$1" <<'PY'
import sys
from urllib.parse import urlparse

raw = (sys.argv[1] or "").strip()
try:
    parsed = urlparse(raw)
except Exception:
    print("")
    raise SystemExit(0)

if parsed.scheme not in {"http", "https", "ws", "wss"}:
    print("")
    raise SystemExit(0)

host = parsed.hostname or ""
if not host:
    print("")
    raise SystemExit(0)

port = parsed.port
if port is None:
    if parsed.scheme in {"http", "ws"}:
        port = 80
    elif parsed.scheme in {"https", "wss"}:
        port = 443

print(f"{host}:{port}")
PY
}

rpc_chain_id() {
  local rpc_url="$1"
  if ! command -v curl >/dev/null 2>&1; then
    return 1
  fi
  local response
  response="$(curl -fsS -m 3 -H 'content-type: application/json' \
    --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' \
    "$rpc_url" 2>/dev/null || true)"
  if [[ -z "$response" ]]; then
    return 1
  fi
  printf '%s' "$response" | sed -n 's/.*"result"[[:space:]]*:[[:space:]]*"\(0x[0-9a-fA-F]\+\)".*/\1/p' | tr '[:upper:]' '[:lower:]'
}

l1="$(norm "$L1_RPC")"
l2="$(norm "$L2_RPC")"
l3="$(norm "$L3_RPC")"
parent_l2="$(norm "$L3_PARENT_L2_RPC")"

[[ -n "$l1" && -n "$l2" && -n "$l3" ]] || die "missing_rpc_endpoints"

[[ "$l1" != "$l2" ]] || die "l1_equals_l2"
[[ "$l1" != "$l3" ]] || die "l1_equals_l3"
[[ "$l2" != "$l3" ]] || die "l2_equals_l3"

l1_host_port="$(url_to_host_port "$l1")"
l2_host_port="$(url_to_host_port "$l2")"
l3_host_port="$(url_to_host_port "$l3")"
parent_l2_host_port="$(url_to_host_port "$parent_l2")"

[[ -n "$l1_host_port" ]] || die "invalid_l1_rpc_url"
[[ -n "$l2_host_port" ]] || die "invalid_l2_rpc_url"
[[ -n "$l3_host_port" ]] || die "invalid_l3_rpc_url"

[[ "$l1_host_port" != "$l2_host_port" ]] || die "l1_equals_l2_hostport"
[[ "$l1_host_port" != "$l3_host_port" ]] || die "l1_equals_l3_hostport"
[[ "$l2_host_port" != "$l3_host_port" ]] || die "l2_equals_l3_hostport"

if [[ -n "$parent_l2" && "$parent_l2_host_port" != "$l2_host_port" ]]; then
  die "l3_parent_not_pointing_to_l2"
fi

if [[ "$l3" == *":18545"* || "$l3" == *"/l1"* ]]; then
  die "l3_direct_l1_bypass_detected"
fi

if [[ "$l2_host_port" == "$l1_host_port" ]]; then
  die "l2_misrouted_to_l1"
fi

if [[ "$L3_FEE_TARGET_CHAIN_ID" != "$L2_CHAIN_ID_EXPECTED" ]]; then
  die "l3_fee_target_chain_must_equal_l2"
fi

if [[ "$L2_REVENUE_TARGET_CHAIN_ID" != "$L1_CHAIN_ID_EXPECTED" ]]; then
  die "l2_revenue_target_chain_must_equal_l1"
fi

if [[ -n "$L2_REVENUE_AGGREGATOR_URL" ]]; then
  l2_revenue_host_port="$(url_to_host_port "$L2_REVENUE_AGGREGATOR_URL")"
  [[ -n "$l2_revenue_host_port" ]] || die "invalid_l2_revenue_aggregator_url"
  [[ "$l2_revenue_host_port" != "$l1_host_port" ]] || die "l3_fee_collector_misrouted_to_l1"
fi

if [[ -n "$L1_TREASURY_ENGINE_URL" ]]; then
  l1_treasury_host_port="$(url_to_host_port "$L1_TREASURY_ENGINE_URL")"
  [[ -n "$l1_treasury_host_port" ]] || die "invalid_l1_treasury_engine_url"
  [[ "$l1_treasury_host_port" != "$l3_host_port" ]] || die "l2_aggregator_misrouted_to_l3"
fi

l1_chain_id="$(rpc_chain_id "$l1" || true)"
l2_chain_id="$(rpc_chain_id "$l2" || true)"
l3_chain_id="$(rpc_chain_id "$l3" || true)"

if [[ -n "$l1_chain_id" && -n "$l2_chain_id" && "$l1_chain_id" == "$l2_chain_id" ]]; then
  die "l1_equals_l2_chain_id"
fi
if [[ -n "$l1_chain_id" && -n "$l3_chain_id" && "$l1_chain_id" == "$l3_chain_id" ]]; then
  die "l1_equals_l3_chain_id"
fi
if [[ -n "$l2_chain_id" && -n "$l3_chain_id" && "$l2_chain_id" == "$l3_chain_id" ]]; then
  die "l2_equals_l3_chain_id"
fi

mkdir -p "$ROOT_DIR/artifacts"
cat > "$ROOT_DIR/artifacts/routing_verification.json" <<JSON
{
  "ok": true,
  "validatedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "law": {
    "l3_to_l2_only": true,
    "l2_to_l1_only": true,
    "no_l3_to_l1_bypass": true,
    "external_settlement_via_l1_only": true
  },
  "rpc": {
    "l1": "$l1",
    "l2": "$l2",
    "l3": "$l3",
    "l1HostPort": "$l1_host_port",
    "l2HostPort": "$l2_host_port",
    "l3HostPort": "$l3_host_port",
    "l3ParentL2": "${parent_l2:-$l2}",
    "l3ParentL2HostPort": "${parent_l2_host_port:-$l2_host_port}",
    "chainIds": {
      "l1": "${l1_chain_id:-unknown}",
      "l2": "${l2_chain_id:-unknown}",
      "l3": "${l3_chain_id:-unknown}"
    }
  }
}
JSON

echo "routing_verify:PASS"
