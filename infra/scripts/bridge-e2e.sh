#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODE="${BRIDGE_E2E_MODE:-l2l3}"
RUN="false"
AMOUNT="${DEMO_AMOUNT_ETH:-1}"
RELAYER_HEALTH_URL="${RELAYER_HEALTH_URL:-http://localhost:7171/health}"

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

if [[ "$RUN" != "true" ]]; then
  log "Dry run. Use --run to execute.";
fi

case "$MODE" in
	  l2l3)
	    DEPOSIT_SCRIPT="$ROOT_DIR/infra/scripts/demo-deposit-erc20.sh"
	    WITHDRAW_SCRIPT="$ROOT_DIR/infra/scripts/demo-withdraw-erc20.sh"

	    if [[ ! -x "$DEPOSIT_SCRIPT" || ! -x "$WITHDRAW_SCRIPT" ]]; then
	      echo "Missing required L2<->L3 demo scripts" >&2
	      exit 1
	    fi

    log "L2<->L3 bridge E2E (ERC20)"
    log "Deposit -> Relay -> Withdraw"

    if [[ "$RUN" == "true" ]]; then
      command -v curl >/dev/null 2>&1 || { echo "Missing required binary: curl" >&2; exit 1; }
      command -v jq >/dev/null 2>&1 || { echo "Missing required binary: jq" >&2; exit 1; }

      if curl -sS "$RELAYER_HEALTH_URL" | jq -e '.observeOnly == true' >/dev/null 2>&1; then
        echo "Relayer is observe-only; configure relayer signing keys (e.g., RELAYER_PRIVATE_KEY) and restart ghost-relayer." >&2
        exit 1
	      fi

	      DEMO_AMOUNT_ETH="$AMOUNT" bash "$DEPOSIT_SCRIPT"

	      LAST_DEPOSIT_PATH="$ROOT_DIR/.tmp/last_deposit_erc20.json"
	      if [[ ! -f "$LAST_DEPOSIT_PATH" ]]; then
	        echo "Missing $LAST_DEPOSIT_PATH (deposit step did not produce an ERC20 receipt)" >&2
        exit 1
      fi

      EXPECTED_NONCE="$(jq -r '.nonce' "$LAST_DEPOSIT_PATH")"
      EXPECTED_AMOUNT_WEI="$(jq -r '.amountWei' "$LAST_DEPOSIT_PATH")"

      log "Waiting for relayer to mint on L3 (nonce=$EXPECTED_NONCE)..."
      for i in $(seq 1 60); do
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
        exit 1
      fi

      DEMO_AMOUNT_ETH="$AMOUNT" bash "$WITHDRAW_SCRIPT"
    fi
    ;;
  l1l2)
    DEPOSIT_SCRIPT="$ROOT_DIR/infra/scripts/demo-deposit-l1l2-erc20.sh"
    WITHDRAW_SCRIPT="$ROOT_DIR/infra/scripts/demo-withdraw-l1l2-erc20.sh"

    if [[ ! -x "$DEPOSIT_SCRIPT" || ! -x "$WITHDRAW_SCRIPT" ]]; then
      echo "Missing required L1<->L2 demo scripts" >&2
      exit 1
    fi

    log "L1<->L2 bridge E2E (ERC20)"
    log "Deposit -> Withdraw"

    if [[ "$RUN" == "true" ]]; then
      DEMO_AMOUNT_ETH="$AMOUNT" bash "$DEPOSIT_SCRIPT"
      DEMO_AMOUNT_ETH="$AMOUNT" bash "$WITHDRAW_SCRIPT"
    fi
    ;;
  *)
    echo "Invalid mode: $MODE" >&2
    exit 1
    ;;
esac

log "Bridge E2E complete"
