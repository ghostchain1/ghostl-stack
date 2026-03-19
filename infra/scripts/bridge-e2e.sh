#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODE="${BRIDGE_E2E_MODE:-l2l3}"
RUN="false"
AMOUNT="${DEMO_AMOUNT_GST:-1}"
RELAYER_HEALTH_URL="${RELAYER_HEALTH_URL:-http://localhost:7171/health}"
STACK_ENV_FILE="${STACK_ENV_FILE:-$ROOT_DIR/services/stack.env}"

unset NODE_OPTIONS

usage() {
  cat <<'USAGE'
Usage: bridge-e2e.sh [--mode l1l2|l2l3] [--run] [--amount N]

Defaults to dry-run. Use --run to execute deposits/withdrawals.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode) MODE="$2"; shift 2;;
    --run) RUN="true"; shift;;
    --amount) AMOUNT="$2"; shift 2;;
    -h|--help) usage; exit 0;;
    *) echo "Unknown arg: $1" >&2; usage; exit 1;;
  esac
done

log() { printf '[bridge-e2e] %s\n' "$*"; }

warn() { printf '[bridge-e2e][WARN] %s\n' "$*" >&2; }

rpc() {
  local url="$1" method="$2" params="${3:-[]}"
  curl -sS -H 'content-type: application/json' \
    --data "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"${method}\",\"params\":${params}}" \
    "$url"
}

normalize_rpc_url() {
  local url="$1"
  # When running on the host, `host.docker.internal` may not resolve on Linux.
  if [[ "$url" == *host.docker.internal* ]] && ! getent hosts host.docker.internal >/dev/null 2>&1; then
    url="${url/host.docker.internal/127.0.0.1}"
  fi
  printf '%s' "$url"
}

code_len() {
  local url="$1" addr="$2"
  rpc "$url" eth_getCode "[\"$addr\",\"latest\"]" | python3 -c 'import json,sys
raw=sys.stdin.read()
code=""
try:
  j=json.loads(raw)
  code=j.get("result","") or ""
except Exception:
  code=""
print(max(0, len(code)-2) if code.startswith("0x") else len(code))'
}

hex_to_int() {
  python3 -c 'import sys
s=sys.stdin.read().strip()
try:
  print(int(s,16))
except Exception:
  print("")'
}

maybe_source_stack_env() {
  if [[ -f "$STACK_ENV_FILE" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$STACK_ENV_FILE"
    set +a
  fi
}

if [[ "$RUN" != "true" ]]; then
  log "Dry run. Use --run to execute.";
fi

case "$MODE" in
	  l2l3)
	    DEPOSIT_SCRIPT="$ROOT_DIR/infra/scripts/demo-deposit-erc20.sh"
	    WITHDRAW_SCRIPT="$ROOT_DIR/infra/scripts/demo-withdraw-erc20.sh"

	    if [[ ! -f "$DEPOSIT_SCRIPT" || ! -f "$WITHDRAW_SCRIPT" ]]; then
	      echo "Missing required L2<->L3 demo scripts" >&2
	      exit 1
	    fi

    log "L2<->L3 bridge E2E (ERC20)"
    log "Deposit -> Relay -> Withdraw"

    if [[ "$RUN" == "true" ]]; then
      command -v curl >/dev/null 2>&1 || { echo "Missing required binary: curl" >&2; exit 1; }
      command -v jq >/dev/null 2>&1 || { echo "Missing required binary: jq" >&2; exit 1; }
      maybe_source_stack_env
      HEALTH_BASE="$(curl -fsS --retry 5 --retry-delay 1 --retry-all-errors "$RELAYER_HEALTH_URL")" || {
        echo "Relayer health endpoint not reachable at $RELAYER_HEALTH_URL" >&2
        exit 1
      }
      if echo "$HEALTH_BASE" | jq -e '.observeOnly == true' >/dev/null 2>&1; then
        echo "Relayer is observe-only; configure relayer signing keys (e.g., RELAYER_PRIVATE_KEY) and restart ghost-relayer." >&2
        exit 1
	      fi

	      DEMO_AMOUNT_GST="$AMOUNT" bash "$DEPOSIT_SCRIPT"

	      LAST_DEPOSIT_PATH="$ROOT_DIR/.tmp/last_deposit_erc20.json"
	      if [[ ! -f "$LAST_DEPOSIT_PATH" ]]; then
	        echo "Missing $LAST_DEPOSIT_PATH (deposit step did not produce an ERC20 receipt)" >&2
        exit 1
      fi

      EXPECTED_NONCE="$(jq -r '.nonce' "$LAST_DEPOSIT_PATH")"
      EXPECTED_AMOUNT_WEI="$(jq -r '.amountWei' "$LAST_DEPOSIT_PATH")"

      log "Waiting for relayer to mint on L3 (nonce=$EXPECTED_NONCE)..."
      for i in $(seq 1 120); do
        HEALTH="$(curl -sS "$RELAYER_HEALTH_URL" || true)"
        KIND="$(echo "$HEALTH" | jq -r '.lastRelayed.kind // empty' 2>/dev/null || true)"
        NONCE="$(echo "$HEALTH" | jq -r '.lastRelayed.nonce // empty' 2>/dev/null || true)"
        AMOUNT_WEI="$(echo "$HEALTH" | jq -r '.lastRelayed.amount // empty' 2>/dev/null || true)"
        if [[ "$KIND" == "ERC20Finalized" && "$NONCE" == "$EXPECTED_NONCE" && "$AMOUNT_WEI" == "$EXPECTED_AMOUNT_WEI" ]]; then
          log "Relayed."
          echo "$HEALTH" | jq .
          break
        fi
        sleep 1
      done

      HEALTH="$(curl -sS "$RELAYER_HEALTH_URL" || true)"
      KIND="$(echo "$HEALTH" | jq -r '.lastRelayed.kind // empty' 2>/dev/null || true)"
      NONCE="$(echo "$HEALTH" | jq -r '.lastRelayed.nonce // empty' 2>/dev/null || true)"
      AMOUNT_WEI="$(echo "$HEALTH" | jq -r '.lastRelayed.amount // empty' 2>/dev/null || true)"
      if [[ "$KIND" != "ERC20Finalized" || "$NONCE" != "$EXPECTED_NONCE" || "$AMOUNT_WEI" != "$EXPECTED_AMOUNT_WEI" ]]; then
        echo "Timed out waiting for ERC20 relay/mint on L3." >&2
        curl -sS "$RELAYER_HEALTH_URL" | jq . || true

        # Targeted diagnostics (no secrets):
        if [[ -n "${RPC_L3:-}" && -n "${L3_TOKEN_FACTORY_ADDRESS:-}" && -n "${L3_INBOX_ADDRESS:-}" ]]; then
          RPC_L3_EFF="$(normalize_rpc_url "$RPC_L3")"
          warn "Checking L3 contract visibility via RPC_L3=$RPC_L3_EFF"
          L3_CHAIN_ID_HEX="$(rpc "$RPC_L3_EFF" eth_chainId "[]" | jq -r '.result // empty' 2>/dev/null || true)"
          L3_CHAIN_ID="$(printf '%s' "$L3_CHAIN_ID_HEX" | hex_to_int)"
          L3_HEAD_HEX="$(rpc "$RPC_L3_EFF" eth_blockNumber "[]" | jq -r '.result // empty' 2>/dev/null || true)"
          L3_HEAD="$(printf '%s' "$L3_HEAD_HEX" | hex_to_int)"
          warn "L3 chainId=$L3_CHAIN_ID head=$L3_HEAD"
          warn "L3 tokenFactory codeLen=$(code_len "$RPC_L3_EFF" "$L3_TOKEN_FACTORY_ADDRESS") addr=$L3_TOKEN_FACTORY_ADDRESS"
          warn "L3 inbox codeLen=$(code_len "$RPC_L3_EFF" "$L3_INBOX_ADDRESS") addr=$L3_INBOX_ADDRESS"
          warn "If codeLen=0 here, the relayer is pointed at an RPC that does not have the deployed contracts."
          warn "Fix: restart ghost-relayer on the Ghost rollup network and use the canonical GhostL3 RPC wiring."
        else
          warn "Missing RPC_L3/L3_TOKEN_FACTORY_ADDRESS/L3_INBOX_ADDRESS for diagnostics (source services/stack.env)."
        fi
        exit 1
      fi

      DEMO_AMOUNT_GST="$AMOUNT" bash "$WITHDRAW_SCRIPT"
    fi
    ;;
  l1l2)
    DEPOSIT_SCRIPT="$ROOT_DIR/infra/scripts/demo-deposit-l1l2-erc20.sh"
    WITHDRAW_SCRIPT="$ROOT_DIR/infra/scripts/demo-withdraw-l1l2-erc20.sh"

    if [[ ! -f "$DEPOSIT_SCRIPT" || ! -f "$WITHDRAW_SCRIPT" ]]; then
      echo "Missing required L1<->L2 demo scripts" >&2
      exit 1
    fi

    log "L1<->L2 bridge E2E (ERC20)"
    log "Deposit -> Withdraw"

    if [[ "$RUN" == "true" ]]; then
      DEMO_AMOUNT_GST="$AMOUNT" bash "$DEPOSIT_SCRIPT"
      DEMO_AMOUNT_GST="$AMOUNT" bash "$WITHDRAW_SCRIPT"
    fi
    ;;
  *)
    echo "Invalid mode: $MODE" >&2
    exit 1
    ;;
esac

log "Bridge E2E complete"
