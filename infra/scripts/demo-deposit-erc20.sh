#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"

unset NODE_OPTIONS

ENV_FILE="$ROOT_DIR/services/ghost-guard/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE (run: bash infra/scripts/up.sh)"
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

OPSTACK_SECRETS="$ROOT_DIR/infra/opstack/.env.secrets"
if [ -f "$OPSTACK_SECRETS" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$OPSTACK_SECRETS"
  set +a
fi

if [ -z "${DEPLOYER_PRIVATE_KEY:-}" ]; then
  echo "Missing DEPLOYER_PRIVATE_KEY (expected in infra/opstack/.env.secrets or env)" >&2
  exit 1
fi

# When running on the host (not inside Docker), `host.docker.internal` may not resolve on Linux.
# Prefer localhost-mapped RPC ports unless the user explicitly overrides with a usable URL.
RPC_L2_EFFECTIVE="${RPC_L2:-http://127.0.0.1:29547}"
case "$RPC_L2_EFFECTIVE" in
  *host.docker.internal*) RPC_L2_EFFECTIVE="http://127.0.0.1:29547" ;;
esac

ETHERS_MODULE="$ROOT_DIR/contracts/node_modules/ethers"
if [ ! -d "$ETHERS_MODULE" ]; then
  echo "Missing ethers module at $ETHERS_MODULE (run: cd contracts && npm ci)" >&2
  exit 1
fi

DEMO_AMOUNT_GST="${DEMO_AMOUNT_GST:-${DEMO_AMOUNT_ETH:-1}}"

# Allow an explicit demo token override (useful when the configured token has no faucet/mint).
TOKEN_ADDRESS="${DEMO_L2_TOKEN_ADDRESS:-${L2_TOKEN_ADDRESS:-}}"
if [ -z "$TOKEN_ADDRESS" ]; then
  echo "Missing L2_TOKEN_ADDRESS (source services/ghost-guard/.env) or set DEMO_L2_TOKEN_ADDRESS" >&2
  exit 1
fi

DEMO_AMOUNT_WEI="$(
  ETHERS_MODULE="$ETHERS_MODULE" AMT="$DEMO_AMOUNT_GST" node -e '
    const { parseEther } = require(process.env.ETHERS_MODULE);
    process.stdout.write(parseEther(process.env.AMT).toString());
  '
)"
DEPOSITOR="$(
  ETHERS_MODULE="$ETHERS_MODULE" PK="$DEPLOYER_PRIVATE_KEY" node -e '
    const { Wallet } = require(process.env.ETHERS_MODULE);
    process.stdout.write(new Wallet(process.env.PK).address);
  '
)"

BALANCE_WEI="$(
  ETHERS_MODULE="$ETHERS_MODULE" RPC_L2="$RPC_L2_EFFECTIVE" TOKEN="$TOKEN_ADDRESS" ACCOUNT="$DEPOSITOR" node -e '
    const { JsonRpcProvider, Contract } = require(process.env.ETHERS_MODULE);
    const provider = new JsonRpcProvider(process.env.RPC_L2);
    const token = new Contract(process.env.TOKEN, ["function balanceOf(address) view returns (uint256)"], provider);
    token.balanceOf(process.env.ACCOUNT).then((b) => process.stdout.write(b.toString())).catch(() => process.stdout.write("0"));
  '
)"

if [ "$BALANCE_WEI" -lt "$DEMO_AMOUNT_WEI" ]; then
  echo "L2 token balance too low for deposit (need=$DEMO_AMOUNT_WEI have=$BALANCE_WEI)."
  echo "Deploying a fresh TestERC20 on L2 and minting demo funds to depositor..."

  MINT_AMOUNT_WEI="$(
    ETHERS_MODULE="$ETHERS_MODULE" AMT="$DEMO_AMOUNT_WEI" node -e '
      // Mint 100x the requested amount to keep repeated E2E runs cheap.
      const v = BigInt(process.env.AMT);
      process.stdout.write((v * 100n).toString());
    '
  )"

  DEPLOY_OUT="$(
    cd "$ROOT_DIR/contracts" && \
    TOKEN_NAME="Ghost Demo Token" TOKEN_SYMBOL="GDM" TOKEN_DECIMALS="18" \
    MINT_TO="$DEPOSITOR" MINT_AMOUNT="$MINT_AMOUNT_WEI" \
    npx hardhat run --network ghostl2Op scripts/deploy-test-erc20.ts
  )"
  TOKEN_ADDRESS="$(printf '%s\n' "$DEPLOY_OUT" | awk '/TestERC20 deployed at:/ {print $4; exit}')"
  if [ -z "$TOKEN_ADDRESS" ]; then
    echo "Failed to parse TestERC20 deployment address." >&2
    exit 1
  fi
  echo "Using fresh demo token: $TOKEN_ADDRESS"
fi

echo "Using BRIDGE_L2L3_ADDRESS=$BRIDGE_L2L3_ADDRESS"
echo "Using L2_TOKEN_ADDRESS=$TOKEN_ADDRESS"
echo "Depositor=$DEPOSITOR"
echo "Sending demo ERC20 deposit (amount=${DEMO_AMOUNT_GST} tokens)..."

cd "$ROOT_DIR/contracts"
DEMO_AMOUNT_GST="$DEMO_AMOUNT_GST" L2_TOKEN_ADDRESS="$TOKEN_ADDRESS" npx hardhat run --network ghostl2Op scripts/demo_deposit_erc20.ts
