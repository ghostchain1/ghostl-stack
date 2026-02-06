#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="${ROOT_DIR:-$(cd "$SCRIPT_DIR/../../.." && pwd)}"
TMP_DIR="$ROOT_DIR/.tmp"
OP_ENV="$ROOT_DIR/infra/opstack/.env"

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || { echo "Missing required command: $1" >&2; exit 1; }
}

need_cmd node
need_cmd jq
need_cmd perl
need_cmd docker
need_cmd curl

guard_env="$ROOT_DIR/services/ghost-guard/.env"
relayer_env="$ROOT_DIR/services/ghost-relayer/.env"
proposer_l2_env="$ROOT_DIR/services/ghost-rollup-proposer/.env.l2"
proposer_l3_env="$ROOT_DIR/services/ghost-rollup-proposer/.env.l3"
challenger_l2_env="$ROOT_DIR/services/ghost-rollup-challenger/.env.l2"
challenger_l3_env="$ROOT_DIR/services/ghost-rollup-challenger/.env.l3"

for f in "$guard_env" "$relayer_env" "$proposer_l2_env" "$proposer_l3_env" "$challenger_l2_env" "$challenger_l3_env"; do
  if [ ! -f "$f" ]; then
    echo "Missing $f. Run: bash infra/scripts/up.sh" >&2
    exit 1
  fi
done

if [ -f "$OP_ENV" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$OP_ENV"
  [ -f "$ROOT_DIR/infra/opstack/.env.secrets" ] && source "$ROOT_DIR/infra/opstack/.env.secrets"
  set +a
fi

mkdir -p "$TMP_DIR"
keys_path="$TMP_DIR/keys.json"

echo "Generating private keys (not printing them)..."

# Generate wallets using ethers from contracts/node_modules.
keys_json="$(
  cd "$ROOT_DIR/contracts"
  node -e "const {Wallet}=require('ethers'); const mk=()=>{const w=Wallet.createRandom(); return {address:w.address, privateKey:w.privateKey};}; console.log(JSON.stringify({guard:mk(), relayer:mk(), proposerL2:mk(), proposerL3:mk(), challengerL2:mk(), challengerL3:mk()}));"
)"

echo "$keys_json" >"$keys_path"
chmod 600 "$keys_path" || true

guard_pk="$(jq -r '.guard.privateKey' "$keys_path")"
relayer_pk="$(jq -r '.relayer.privateKey' "$keys_path")"
proposer_l2_pk="$(jq -r '.proposerL2.privateKey' "$keys_path")"
proposer_l3_pk="$(jq -r '.proposerL3.privateKey' "$keys_path")"
challenger_l2_pk="$(jq -r '.challengerL2.privateKey' "$keys_path")"
challenger_l3_pk="$(jq -r '.challengerL3.privateKey' "$keys_path")"

guard_addr="$(jq -r '.guard.address' "$keys_path")"
relayer_addr="$(jq -r '.relayer.address' "$keys_path")"
proposer_l2_addr="$(jq -r '.proposerL2.address' "$keys_path")"
proposer_l3_addr="$(jq -r '.proposerL3.address' "$keys_path")"
challenger_l2_addr="$(jq -r '.challengerL2.address' "$keys_path")"
challenger_l3_addr="$(jq -r '.challengerL3.address' "$keys_path")"

echo "Writing keys into env files..."

admin_token="$(
  cd "$ROOT_DIR/contracts"
  node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
)"

perl -0777 -i -pe "s/^PRIVATE_KEY=.*$/PRIVATE_KEY=$guard_pk/m" "$guard_env"
perl -0777 -i -pe "s/^ADMIN_TOKEN=.*$/ADMIN_TOKEN=$admin_token/m" "$guard_env"
perl -0777 -i -pe "s/^RELAYER_PRIVATE_KEY=.*$/RELAYER_PRIVATE_KEY=$relayer_pk/m; s/^L2_RELAYER_PRIVATE_KEY=.*$/L2_RELAYER_PRIVATE_KEY=$relayer_pk/m" "$relayer_env"
perl -0777 -i -pe "s/^PROPOSER_PRIVATE_KEY=.*$/PROPOSER_PRIVATE_KEY=$proposer_l2_pk/m" "$proposer_l2_env"
perl -0777 -i -pe "s/^PROPOSER_PRIVATE_KEY=.*$/PROPOSER_PRIVATE_KEY=$proposer_l3_pk/m" "$proposer_l3_env"
perl -0777 -i -pe "s/^CHALLENGER_PRIVATE_KEY=.*$/CHALLENGER_PRIVATE_KEY=$challenger_l2_pk/m" "$challenger_l2_env"
perl -0777 -i -pe "s/^CHALLENGER_PRIVATE_KEY=.*$/CHALLENGER_PRIVATE_KEY=$challenger_l3_pk/m" "$challenger_l3_env"

echo "Addresses:"
echo "  guard(l2):      $guard_addr"
echo "  relayer(l2+l3): $relayer_addr"
echo "  proposer(l2->l1): $proposer_l2_addr"
echo "  proposer(l3->l2): $proposer_l3_addr"
echo "  challenger(l2->l1): $challenger_l2_addr"
echo "  challenger(l3->l2): $challenger_l3_addr"

echo "Pausing proposers during funding (avoids nonce collisions)..."
cd "$ROOT_DIR/.devcontainer"
docker compose stop --no-deps ghost-rollup-proposer-l2 ghost-rollup-proposer-l3 >/dev/null 2>&1 || true
docker compose stop --no-deps ghost-rollup-challenger-l2 ghost-rollup-challenger-l3 >/dev/null 2>&1 || true

HOST_L1_RPC="${HOST_L1_RPC:-http://localhost:18545}"
HOST_L2_RPC="${HOST_L2_RPC:-http://localhost:29547}"
HOST_L3_RPC="${HOST_L3_RPC:-http://localhost:39545}"
FUND_AMOUNT_GST="${FUND_AMOUNT_GST:-${FUND_AMOUNT_ETH:-10}}"

rpc_ready() {
  local url="$1"
  curl -fsS -X POST "$url" -H 'content-type: application/json' \
    --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' >/dev/null 2>&1
}

echo "Funding addresses on L1/L2/L3 from the default dev-funded account..."

fund_list="$(
  jq -cn \
    --arg a "$guard_addr" \
    --arg b "$relayer_addr" \
    --arg d "$proposer_l2_addr" \
    --arg e "$proposer_l3_addr" \
    --arg f "$challenger_l2_addr" \
    --arg g "$challenger_l3_addr" \
    '[ $a, $b, $d, $e, $f, $g ]'
)"

(
  cd "$ROOT_DIR/contracts"
  FUND_AMOUNT_GST="$FUND_AMOUNT_GST" FUND_ADDRESSES_JSON="$fund_list" RPC_L1="$HOST_L1_RPC" \
    npx hardhat run --network anvil scripts/fund_addresses.ts >/dev/null
  FUND_AMOUNT_GST="$FUND_AMOUNT_GST" FUND_ADDRESSES_JSON="$fund_list" OP_L2_RPC="$HOST_L2_RPC" \
    npx hardhat run --network ghostl2Op scripts/fund_addresses.ts >/dev/null
  if rpc_ready "$HOST_L3_RPC"; then
    FUND_AMOUNT_GST="$FUND_AMOUNT_GST" FUND_ADDRESSES_JSON="$fund_list" OP_L3_RPC="$HOST_L3_RPC" \
      npx hardhat run --network ghostl3Op scripts/fund_addresses.ts >/dev/null
  else
    echo "Skipping L3 funding (RPC not reachable at $HOST_L3_RPC)"
  fi

  echo "Configuring on-chain roles (proposers + relayer)..."
  set -a
  # shellcheck disable=SC1090
  source "$relayer_env"
  set +a
  RELAYER_ADDRESS="$relayer_addr" PROPOSER_L2_ON_L1_ADDRESS="$proposer_l2_addr" PROPOSER_L3_ON_L2_ADDRESS="$proposer_l3_addr" \
    RPC_L1="$HOST_L1_RPC" RPC_L2="$HOST_L2_RPC" RPC_L3="$HOST_L3_RPC" \
    npx hardhat run --network anvil scripts/configure_roles.ts >/dev/null
)

echo "Restarting services to pick up updated env..."
docker compose up -d --no-deps --force-recreate \
  ghost-guard ghost-relayer \
  ghost-rollup-proposer-l2 ghost-rollup-proposer-l3 \
  ghost-rollup-challenger-l2 ghost-rollup-challenger-l3 >/dev/null

echo "Done."
echo "Guard:   http://localhost:7070/health"
echo "Relayer: http://localhost:7171/health"
echo "PropL2:  http://localhost:7272/health"
echo "PropL3:  http://localhost:7373/health"
