#!/usr/bin/env bash
set -euo pipefail

# Fund one or more addresses on the OP Stack devnet (L1 + L2; optional L3 if reachable).

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="${ROOT_DIR:-$(cd "$SCRIPT_DIR/../../.." && pwd)}"
OP_ENV="$ROOT_DIR/infra/opstack/.env"

usage() {
  cat <<'EOF' >&2
Usage: bash infra/scripts/chains/premine.sh <addr> [addr2 ...] [--amount GST] [--no-l3]
  --amount GST  amount to send to each address (default: 10)
  --no-l3       skip L3 funding even if L3 RPC is reachable
EOF
}

if [ "$#" -lt 1 ]; then
  usage
  exit 1
fi

amount="10"
fund_l3=1
addrs=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --amount)
      amount="$2"
      shift 2
      ;;
    --no-l3)
      fund_l3=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      addrs+=("$1")
      shift
      ;;
  esac
done

if [ ${#addrs[@]} -eq 0 ]; then
  usage
  exit 1
fi

if [ -f "$OP_ENV" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$OP_ENV"
  [ -f "$ROOT_DIR/infra/opstack/.env.secrets" ] && source "$ROOT_DIR/infra/opstack/.env.secrets"
  set +a
fi

RPC_L1="${HOST_L1_RPC:-http://localhost:18545}"
OP_L2_RPC="${OP_L2_RPC:-${HOST_L2_RPC:-http://localhost:29547}}"
OP_L3_RPC="${OP_L3_RPC:-${HOST_L3_RPC:-http://localhost:39545}}"

rpc_ready() {
  local url="$1"
  curl -fsS -X POST "$url" -H 'content-type: application/json' \
    --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' >/dev/null 2>&1
}

to_json_array() {
  local arr=("$@")
  printf '%s\n' "${arr[@]}" | jq -Rs 'split("\n") | map(select(length>0))'
}

fund_json="$(to_json_array "${addrs[@]}")"

cd "$ROOT_DIR/contracts"

echo "Funding addresses on L1 (${RPC_L1})..."
FUND_AMOUNT_GST="$amount" FUND_ADDRESSES_JSON="$fund_json" RPC_L1="$RPC_L1" \
  npx hardhat run --network anvil scripts/fund_addresses.ts >/dev/null

echo "Funding addresses on L2 (${OP_L2_RPC})..."
FUND_AMOUNT_GST="$amount" FUND_ADDRESSES_JSON="$fund_json" OP_L2_RPC="$OP_L2_RPC" \
  npx hardhat run --network ghostl2Op scripts/fund_addresses.ts >/dev/null

if [ $fund_l3 -eq 1 ] && rpc_ready "$OP_L3_RPC"; then
  echo "Funding addresses on L3 (${OP_L3_RPC})..."
  FUND_AMOUNT_GST="$amount" FUND_ADDRESSES_JSON="$fund_json" OP_L3_RPC="$OP_L3_RPC" \
    npx hardhat run --network ghostl3Op scripts/fund_addresses.ts >/dev/null
else
  echo "Skipping L3 funding (disabled or RPC unreachable at $OP_L3_RPC)."
fi

echo "Done."
