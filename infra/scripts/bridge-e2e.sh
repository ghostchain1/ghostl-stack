#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODE="${BRIDGE_E2E_MODE:-l2l3}"
RUN="false"
AMOUNT="${DEMO_AMOUNT_ETH:-1}"

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
    RELAY_SCRIPT="$ROOT_DIR/infra/scripts/demo-relay.sh"

    if [[ ! -x "$DEPOSIT_SCRIPT" || ! -x "$WITHDRAW_SCRIPT" || ! -x "$RELAY_SCRIPT" ]]; then
      echo "Missing required L2<->L3 demo scripts" >&2
      exit 1
    fi

    log "L2<->L3 bridge E2E (ERC20)"
    log "Deposit -> Relay -> Withdraw"

    if [[ "$RUN" == "true" ]]; then
      DEMO_AMOUNT_ETH="$AMOUNT" bash "$DEPOSIT_SCRIPT"
      DEMO_AMOUNT_ETH="$AMOUNT" bash "$RELAY_SCRIPT"
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
