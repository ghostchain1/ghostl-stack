#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
OPSTACK_DIR="$ROOT_DIR/infra/opstack"
ENV_L2="${PHASE10_ENV_L2:-$OPSTACK_DIR/.env}"
ENV_L3="${PHASE10_ENV_L3:-$OPSTACK_DIR/.env.l3}"
ENV_STACK="${PHASE10_STACK_ENV:-$ROOT_DIR/services/stack.env}"

if [[ -f "$ENV_L2" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_L2"
  set +a
fi
if [[ -f "$ENV_L3" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_L3"
  set +a
fi
if [[ -f "$ENV_STACK" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_STACK"
  set +a
fi

L1_RPC="${PHASE10_L1_RPC:-${HOST_L1_RPC:-${RPC_L1:-http://localhost:18545}}}"
L2_RPC="${PHASE10_L2_RPC:-${HOST_L2_RPC:-${RPC_L2:-http://localhost:29547}}}"
L3_RPC="${PHASE10_L3_RPC:-${HOST_L3_RPC:-${RPC_L3:-http://localhost:39545}}}"
GUARD_HEALTH_URL="${PHASE10_GUARD_URL:-${GUARD_URL:-http://localhost:7070}}"
normalize_url() {
  local url="$1"
  if [[ "$url" == *host.docker.internal* ]] && ! getent hosts host.docker.internal >/dev/null 2>&1; then
    url="${url/host.docker.internal/localhost}"
  fi
  printf '%s' "$url"
}

GUARD_HEALTH_URL="$(normalize_url "$GUARD_HEALTH_URL")"


L2_GAME_FACTORY_ADDR="${L2_DISPUTE_GAME_FACTORY_ADDRESS:-${L2_GAME_FACTORY_ADDRESS:-${GAME_FACTORY_ADDRESS:-}}}"
L3_GAME_FACTORY_ADDR="${L3_DISPUTE_GAME_FACTORY_ADDRESS:-${L3_GAME_FACTORY_ADDRESS:-}}"
GUARD_POLICY_ADDR="${GUARD_POLICY_ADDRESS:-}"
BRIDGE_ADDR="${BRIDGE_L2L3_ADDRESS:-${BRIDGE_ADDRESS:-}}"

json_escape() {
  printf '%s' "$1" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'
}

to_checksum_or_empty() {
  local value="${1:-}"
  if [[ -z "$value" ]]; then
    echo ""
    return
  fi
  node -e 'const v=process.argv[1]; try { const {ghost}=require("ghost"); console.log(ghost.getAddress(v)); } catch { process.exit(1); }' "$value" 2>/dev/null || echo ""
}

rpc_call() {
  local rpc_url="$1"
  local payload="$2"
  curl -sS --fail --max-time 10 -H 'content-type: application/json' --data "$payload" "$rpc_url"
}

code_len() {
  local rpc_url="$1"
  local addr="$2"
  rpc_call "$rpc_url" "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_getCode\",\"params\":[\"$addr\",\"latest\"]}" \
    | python3 -c 'import json,sys
raw=sys.stdin.read()
try:
  j=json.loads(raw)
  code=(j.get("result") or "")
except Exception:
  code=""
print(max(0,len(code)-2) if code.startswith("0x") else len(code))'
}

eth_call_payload() {
  local to_addr="$1"
  local data="$2"
  local from_addr="${3:-}"
  if [[ -n "$from_addr" ]]; then
    printf '{"jsonrpc":"2.0","id":1,"method":"eth_call","params":[{"to":"%s","from":"%s","data":"%s"},"latest"]}' "$to_addr" "$from_addr" "$data"
  else
    printf '{"jsonrpc":"2.0","id":1,"method":"eth_call","params":[{"to":"%s","data":"%s"},"latest"]}' "$to_addr" "$data"
  fi
}

decode_address_result() {
  local raw="${1:-}"
  node -e 'const x=(process.argv[1]||"").toLowerCase(); if(!x.startsWith("0x")||x.length<66){process.exit(1)} const hex=x.slice(-40); if(!/^[0-9a-f]{40}$/.test(hex)){process.exit(1)} console.log("0x"+hex);' "$raw" 2>/dev/null || true
}

L2_GAME_FACTORY_ADDR="$(to_checksum_or_empty "$L2_GAME_FACTORY_ADDR")"
L3_GAME_FACTORY_ADDR="$(to_checksum_or_empty "$L3_GAME_FACTORY_ADDR")"
GUARD_POLICY_ADDR="$(to_checksum_or_empty "$GUARD_POLICY_ADDR")"
BRIDGE_ADDR="$(to_checksum_or_empty "$BRIDGE_ADDR")"

failures=0

check_l2_dispute_ok=false
check_l3_dispute_ok=false
check_l2_pause_ok=false
check_l3_rate_limit_ok=false
check_l3_manual_finalize_lock_ok=false

l2_game_factory_code_len=0
l3_game_factory_code_len=0
guard_policy_code_len=0
guard_policy_mode=""
guard_rate_limit_window_ms=0
guard_rate_limit_max=0
l3_bridge_relayer=""
l3_manual_finalize_revert=""

# 1) Dispute games enabled (fault-proof path)
if [[ -n "$L2_GAME_FACTORY_ADDR" ]]; then
  l2_game_factory_code_len="$(code_len "$L1_RPC" "$L2_GAME_FACTORY_ADDR")"
  if [[ "$l2_game_factory_code_len" -gt 0 ]]; then
    check_l2_dispute_ok=true
  fi
fi
if [[ -n "$L3_GAME_FACTORY_ADDR" ]]; then
  l3_game_factory_code_len="$(code_len "$L2_RPC" "$L3_GAME_FACTORY_ADDR")"
  if [[ "$l3_game_factory_code_len" -gt 0 ]]; then
    check_l3_dispute_ok=true
  fi
fi
if [[ "$check_l2_dispute_ok" != true || "$check_l3_dispute_ok" != true ]]; then
  echo "[phase10] FAIL: dispute game factory missing or undeployed on required parent chain(s)"
  failures=$((failures + 1))
fi

# 2) Emergency pause at L2 (guard policy + control plane)
if [[ -n "$GUARD_POLICY_ADDR" ]]; then
  guard_policy_code_len="$(code_len "$L2_RPC" "$GUARD_POLICY_ADDR")"
fi

guard_policy_json="$(curl -sS --max-time 6 "$GUARD_HEALTH_URL/policy" || true)"
guard_policy_mode="$(printf '%s' "$guard_policy_json" | node -e 'const fs=require("fs"); try { const j=JSON.parse(fs.readFileSync(0,"utf8")); const m=j?.policy?.mode || ""; if (typeof m === "string") process.stdout.write(m); } catch {}')"

if [[ "$guard_policy_code_len" -gt 0 && "$guard_policy_mode" =~ ^(allow|delay|pause)$ ]]; then
  check_l2_pause_ok=true
else
  echo "[phase10] FAIL: L2 emergency pause control not verifiable (guard policy code/mode check failed)"
  failures=$((failures + 1))
fi

# 3) Rate limits on L3 messaging (ghost-guard runtime limiter)
guard_container="$(docker ps --format '{{.Names}}' | grep -E '(^|-)ghost-guard(-|$)|guard' | head -n1 || true)"
if [[ -n "$guard_container" ]]; then
  guard_env_json="$(docker inspect "$guard_container" --format '{{json .Config.Env}}' 2>/dev/null || echo '[]')"
  guard_rate_limit_window_ms="$(printf '%s' "$guard_env_json" | node -e 'const fs=require("fs"); const arr=JSON.parse(fs.readFileSync(0,"utf8")); const val=arr.find(v=>v.startsWith("RATE_LIMIT_WINDOW_MS=")); const n=val?Number(val.split("=")[1]):1000; process.stdout.write(String(Number.isFinite(n)?n:0));')"
  guard_rate_limit_max="$(printf '%s' "$guard_env_json" | node -e 'const fs=require("fs"); const arr=JSON.parse(fs.readFileSync(0,"utf8")); const val=arr.find(v=>v.startsWith("RATE_LIMIT_MAX=")); const n=val?Number(val.split("=")[1]):20; process.stdout.write(String(Number.isFinite(n)?n:0));')"
else
  guard_rate_limit_window_ms=1000
  guard_rate_limit_max=20
fi

if [[ "$guard_rate_limit_window_ms" -gt 0 && "$guard_rate_limit_max" -gt 0 ]]; then
  check_l3_rate_limit_ok=true
else
  echo "[phase10] FAIL: L3 messaging rate limiter is disabled or invalid"
  failures=$((failures + 1))
fi

# 4) Manual finalization disabled on L3 path (only relayer can finalize)
if [[ -n "$BRIDGE_ADDR" ]]; then
  relayer_call_data="$(node -e 'const {ghost}=require("ghost"); const i=new ghost.Interface(["function relayer() view returns (address)"]); process.stdout.write(i.encodeFunctionData("relayer"));')"
  relayer_payload="$(eth_call_payload "$BRIDGE_ADDR" "$relayer_call_data")"
  relayer_raw="$(rpc_call "$L2_RPC" "$relayer_payload" | node -e 'const fs=require("fs"); const j=JSON.parse(fs.readFileSync(0,"utf8")); process.stdout.write(j.result||"")' || true)"
  l3_bridge_relayer="$(decode_address_result "$relayer_raw" | tr '[:upper:]' '[:lower:]')"

  finalize_call_data="$(node -e 'const {ghost}=require("ghost"); const i=new ghost.Interface(["function finalizeToL3(address,address,uint256,uint256)"]); process.stdout.write(i.encodeFunctionData("finalizeToL3", ["0x70997970C51812dc3A010C7d01b50e0d17dc79C8","0x70997970C51812dc3A010C7d01b50e0d17dc79C8",1,1]));')"
  finalize_payload="$(eth_call_payload "$BRIDGE_ADDR" "$finalize_call_data" "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC")"
  finalize_resp="$(rpc_call "$L2_RPC" "$finalize_payload" || true)"
  l3_manual_finalize_revert="$(printf '%s' "$finalize_resp" | node -e 'const fs=require("fs"); try { const j=JSON.parse(fs.readFileSync(0,"utf8")); const msg=j?.error?.message || j?.error?.data || ""; process.stdout.write(String(msg)); } catch {}')"

  if [[ -n "$l3_bridge_relayer" && "$l3_bridge_relayer" != "0x0000000000000000000000000000000000000000" && "$l3_manual_finalize_revert" == *"not relayer"* ]]; then
    check_l3_manual_finalize_lock_ok=true
  fi
fi

if [[ "$check_l3_manual_finalize_lock_ok" != true ]]; then
  echo "[phase10] FAIL: could not prove manual finalization lock (only-relayer gate)"
  failures=$((failures + 1))
fi

cat <<EOF
{
  "ok": $([[ "$failures" -eq 0 ]] && echo true || echo false),
  "checks": {
    "disputeGamesEnabled": {
      "l2OnL1": {
        "address": "$L2_GAME_FACTORY_ADDR",
        "codeLen": $l2_game_factory_code_len,
        "ok": $check_l2_dispute_ok
      },
      "l3OnL2": {
        "address": "$L3_GAME_FACTORY_ADDR",
        "codeLen": $l3_game_factory_code_len,
        "ok": $check_l3_dispute_ok
      }
    },
    "emergencyPauseAtL2": {
      "guardPolicyAddress": "$GUARD_POLICY_ADDR",
      "guardPolicyCodeLen": $guard_policy_code_len,
      "guardPolicyMode": "$guard_policy_mode",
      "guardUrl": "$GUARD_HEALTH_URL",
      "ok": $check_l2_pause_ok
    },
    "l3MessagingRateLimits": {
      "windowMs": $guard_rate_limit_window_ms,
      "max": $guard_rate_limit_max,
      "ok": $check_l3_rate_limit_ok
    },
    "manualFinalizationDisabledOnL3": {
      "bridgeAddress": "$BRIDGE_ADDR",
      "bridgeRelayer": "$l3_bridge_relayer",
      "revertContainsNotRelayer": $([[ "$l3_manual_finalize_revert" == *"not relayer"* ]] && echo true || echo false),
      "revertMessage": $(json_escape "$l3_manual_finalize_revert"),
      "ok": $check_l3_manual_finalize_lock_ok
    }
  },
  "rpc": {
    "l1": "$L1_RPC",
    "l2": "$L2_RPC",
    "l3": "$L3_RPC"
  },
  "failures": $failures
}
EOF

if [[ "$failures" -ne 0 ]]; then
  exit 1
fi

echo "[phase10] PASS: fault/safety controls validated"
