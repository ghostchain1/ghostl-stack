#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"

unset NODE_OPTIONS

GUARD_ENV="$ROOT_DIR/services/ghost-guard/.env"
RELAYER_ENV="$ROOT_DIR/services/ghost-relayer/.env"

if [ ! -f "$GUARD_ENV" ] || [ ! -f "$RELAYER_ENV" ]; then
  echo "Missing env files (run: bash infra/scripts/up.sh)"
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$GUARD_ENV"
# shellcheck disable=SC1090
source "$RELAYER_ENV"

# Prefer the canonical stack-level env if present (this repo is migrating to stack.env as source of truth).
STACK_ENV="$ROOT_DIR/services/stack.env"
if [ -f "$STACK_ENV" ]; then
  # shellcheck disable=SC1090
  source "$STACK_ENV"
fi
set +a

# When running on the host (not inside Docker), `host.docker.internal` may not resolve on Linux.
# Prefer localhost-mapped RPC ports unless the user explicitly overrides with a usable URL.
RPC_L2_EFFECTIVE="${RPC_L2:-http://127.0.0.1:29547}"
RPC_L3_EFFECTIVE="${RPC_L3:-http://127.0.0.1:39545}"
case "$RPC_L2_EFFECTIVE" in
  *host.docker.internal*) RPC_L2_EFFECTIVE="http://127.0.0.1:29547" ;;
esac
case "$RPC_L3_EFFECTIVE" in
  *host.docker.internal*) RPC_L3_EFFECTIVE="http://127.0.0.1:39545" ;;
esac

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

ghost_MODULE="$ROOT_DIR/contracts/node_modules/ghost"
if [ ! -d "$ghost_MODULE" ]; then
  echo "Missing ghost module at $ghost_MODULE (run: cd contracts && npm ci)" >&2
  exit 1
fi

DEPOSITOR="$(
  ghost_MODULE="$ghost_MODULE" PK="$DEPLOYER_PRIVATE_KEY" node -e '
    const { Wallet } = require(process.env.ghost_MODULE);
    process.stdout.write(new Wallet(process.env.PK).address);
  '
)"

LAST_DEPOSIT_PATH="$ROOT_DIR/.tmp/last_deposit_erc20.json"
if [ -f "$LAST_DEPOSIT_PATH" ]; then
  # Prefer the last deposit token so withdraw always targets the same ERC20 pair.
  L2_TOKEN_ADDRESS="$(jq -r '.token' "$LAST_DEPOSIT_PATH")"
  DEPOSITOR="$(jq -r '.from' "$LAST_DEPOSIT_PATH")"
fi

if [ -z "${L2_TOKEN_ADDRESS:-}" ]; then
  echo "Missing L2_TOKEN_ADDRESS (source services/ghost-guard/.env) and no $LAST_DEPOSIT_PATH present." >&2
  exit 1
fi

if [ -z "${L3_TOKEN_FACTORY_ADDRESS:-}" ]; then
  echo "Missing L3_TOKEN_FACTORY_ADDRESS (source services/ghost-relayer/.env)." >&2
  exit 1
fi

# Resolve the bridged L3 token for this L2 token via the on-chain factory.
L3_TOKEN_ADDRESS="$(
  ghost_MODULE="$ghost_MODULE" RPC_L3="$RPC_L3_EFFECTIVE" FACTORY="$L3_TOKEN_FACTORY_ADDRESS" L2TOKEN="$L2_TOKEN_ADDRESS" node -e '
    const { JsonRpcProvider, Contract, getAddress } = require(process.env.ghost_MODULE);
    const provider = new JsonRpcProvider(process.env.RPC_L3);
    const factory = new Contract(
      process.env.FACTORY,
      ["function l3TokenForL2Token(address) view returns (address)"],
      provider
    );
    factory
      .l3TokenForL2Token(process.env.L2TOKEN)
      .then((a) => process.stdout.write(getAddress(a)))
      .catch(() => process.stdout.write(""));
  '
)"

if [ -z "$L3_TOKEN_ADDRESS" ] || [ "$L3_TOKEN_ADDRESS" = "0x0000000000000000000000000000000000000000" ]; then
  echo "Unable to resolve L3 token for L2 token $L2_TOKEN_ADDRESS via factory $L3_TOKEN_FACTORY_ADDRESS." >&2
  echo "Hint: run a deposit first (bridge-e2e --mode l2l3 --run) to trigger token deployment." >&2
  exit 1
fi

DEMO_AMOUNT_GST="${DEMO_AMOUNT_GST:-1}"

echo "Demo withdraw ERC20 (burn on L3 -> release on L2) amount=${DEMO_AMOUNT_GST}"
echo "Using L2_TOKEN_ADDRESS=$L2_TOKEN_ADDRESS"
echo "Using L3_TOKEN_ADDRESS=$L3_TOKEN_ADDRESS"
echo "Account=$DEPOSITOR"

HEALTH_BASE="$(curl -fsS --retry 5 --retry-delay 1 --retry-all-errors http://localhost:7171/health)" || {
  echo "Relayer health endpoint not reachable at http://localhost:7171/health" >&2
  exit 1
}
if echo "$HEALTH_BASE" | jq -e '.observeOnly == true' >/dev/null; then
  echo "Relayer is observe-only; set RELAYER_PRIVATE_KEY (and optionally L2_RELAYER_PRIVATE_KEY) and restart ghost-relayer."
  exit 1
fi

cd "$ROOT_DIR/contracts"
DEMO_AMOUNT_GST="$DEMO_AMOUNT_GST" L3_TOKEN_ADDRESS="$L3_TOKEN_ADDRESS" npx hardhat run --network ghostl3Op scripts/demo_burn_erc20_l3.ts

LAST_WITHDRAW_PATH="$ROOT_DIR/.tmp/last_withdraw_erc20.json"
EXPECTED_NONCE="$(jq -r '.nonce' "$LAST_WITHDRAW_PATH")"
EXPECTED_AMOUNT_WEI="$(jq -r '.amountWei' "$LAST_WITHDRAW_PATH")"

WAIT_DEFAULT_SECONDS=60
GATING_L3_FINALITY_ON_L2="false"
if command -v curl >/dev/null 2>&1 && command -v jq >/dev/null 2>&1; then
  HEALTH_FLAGS="$(curl -fsS --retry 3 --retry-delay 1 --retry-all-errors http://localhost:7171/health || true)"
  GATING_L3_FINALITY_ON_L2="$(echo "$HEALTH_FLAGS" | jq -r '.rollupGating.l3FinalityOnL2 // false' 2>/dev/null || true)"
fi
if [ "$GATING_L3_FINALITY_ON_L2" = "true" ]; then
  # With rollup finality gating enabled, withdraw release can take:
  # confirmations on child chain + propose interval + challenge period.
  WAIT_DEFAULT_SECONDS=180
fi
RELAYER_WAIT_SECONDS="${RELAYER_WAIT_SECONDS:-$WAIT_DEFAULT_SECONDS}"

# If rollup finality gating is enabled and we have enough info, estimate a safer default wait
# based on the current rollup proposer lag. This keeps E2E from flaking when the proposer starts behind.
if [ "$GATING_L3_FINALITY_ON_L2" = "true" ] && [ -z "${RELAYER_WAIT_SECONDS_EXPLICIT:-}" ]; then
  if command -v jq >/dev/null 2>&1; then
    if [ -n "${L2_ROLLUP_L3_ADDRESS:-}" ] && [ -n "${RPC_L2_EFFECTIVE:-}" ] && [ -n "${RPC_L3_EFFECTIVE:-}" ]; then
      ESTIMATE="$(
        ghost_MODULE="$ghost_MODULE" RPC_L2="$RPC_L2_EFFECTIVE" RPC_L3="$RPC_L3_EFFECTIVE" ROLLUP="$L2_ROLLUP_L3_ADDRESS" node - <<'NODE'
const { JsonRpcProvider, Contract } = require(process.env.ghost_MODULE);

const l2 = new JsonRpcProvider(process.env.RPC_L2);
const l3 = new JsonRpcProvider(process.env.RPC_L3);
const rollup = new Contract(
  process.env.ROLLUP,
  [
    "function batchesLength() view returns (uint256)",
    "function batches(uint256) view returns (uint256 startBlock,uint256 endBlock,bytes32 root,uint256 proposedAt,bool challenged,bool finalized,bool invalidated)",
    "function challengePeriodSeconds() view returns (uint256)"
  ],
  l2
);

(async () => {
  const l3Head = await l3.getBlockNumber();
  const len = Number(await rollup.batchesLength());
  const last = await rollup.batches(len - 1);
  const end = Number(last.endBlock);
  const cp = Number(await rollup.challengePeriodSeconds());
  const diff = Math.max(0, l3Head - end);
  // Conservative: assume net catch-up of ~1 block/s. Add challenge period + slack.
  const est = Math.min(1800, Math.max(180, diff * 2 + cp + 30));
  process.stdout.write(JSON.stringify({ l3Head, rollupEnd: end, diff, challengePeriodSeconds: cp, waitSeconds: est }));
})().catch(() => {});
NODE
      )"
      if [ -n "$ESTIMATE" ]; then
        EST_WAIT="$(echo "$ESTIMATE" | jq -r '.waitSeconds // empty' 2>/dev/null || true)"
        if [ -n "$EST_WAIT" ]; then
          if [ "$RELAYER_WAIT_SECONDS" -lt "$EST_WAIT" ]; then
            RELAYER_WAIT_SECONDS="$EST_WAIT"
          fi
        fi
      fi
    fi
  fi
fi

echo "Waiting for relayer to release on L2 (nonce=$EXPECTED_NONCE, wait=${RELAYER_WAIT_SECONDS}s, l3FinalityOnL2=$GATING_L3_FINALITY_ON_L2)..."
for i in $(seq 1 "$RELAYER_WAIT_SECONDS"); do
  HEALTH="$(curl -sS http://localhost:7171/health || true)"
  KIND="$(echo "$HEALTH" | jq -r '.lastRelayed.kind // empty' 2>/dev/null || true)"
  NONCE="$(echo "$HEALTH" | jq -r '.lastRelayed.nonce // empty' 2>/dev/null || true)"
  AMOUNT="$(echo "$HEALTH" | jq -r '.lastRelayed.amount // empty' 2>/dev/null || true)"
  if [ "$KIND" = "ERC20WithdrawReleased" ] && [ "$NONCE" = "$EXPECTED_NONCE" ] && [ "$AMOUNT" = "$EXPECTED_AMOUNT_WEI" ]; then
    echo "Released."
    echo "$HEALTH" | jq .
    break
  fi
  sleep 1
done

HEALTH="$(curl -sS http://localhost:7171/health || true)"
KIND="$(echo "$HEALTH" | jq -r '.lastRelayed.kind // empty' 2>/dev/null || true)"
NONCE="$(echo "$HEALTH" | jq -r '.lastRelayed.nonce // empty' 2>/dev/null || true)"
AMOUNT="$(echo "$HEALTH" | jq -r '.lastRelayed.amount // empty' 2>/dev/null || true)"
if [ "$KIND" != "ERC20WithdrawReleased" ] || [ "$NONCE" != "$EXPECTED_NONCE" ] || [ "$AMOUNT" != "$EXPECTED_AMOUNT_WEI" ]; then
  echo "Timed out waiting for relayer to release ERC20 on L2." >&2
  echo "Hint: set RELAYER_WAIT_SECONDS=180 (or higher) when rollup finality gating is enabled." >&2
  echo "$HEALTH" | jq . || true
  exit 1
fi

echo "L2 balance:"
DEMO_ACCOUNT="$DEPOSITOR" L2_TOKEN_ADDRESS="$L2_TOKEN_ADDRESS" npx hardhat run --network ghostl2Op scripts/demo_balance_l2.ts
echo "L3 balance:"
DEMO_ACCOUNT="$DEPOSITOR" L3_TOKEN_ADDRESS="$L3_TOKEN_ADDRESS" npx hardhat run --network ghostl3Op scripts/demo_balance_l3.ts
