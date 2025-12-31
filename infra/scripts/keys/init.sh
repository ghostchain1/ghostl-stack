#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/workspaces/ghostl-stack"
TMP_DIR="$ROOT_DIR/.tmp"

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || { echo "Missing required command: $1" >&2; exit 1; }
}

need_cmd node
need_cmd jq
need_cmd perl
need_cmd docker

guard_env="$ROOT_DIR/services/ghost-guard/.env"
relayer_env="$ROOT_DIR/services/ghost-relayer/.env"
proposer_l2_env="$ROOT_DIR/services/ghost-rollup-proposer/.env.l2"
proposer_l3_env="$ROOT_DIR/services/ghost-rollup-proposer/.env.l3"

for f in "$guard_env" "$relayer_env" "$proposer_l2_env" "$proposer_l3_env"; do
  if [ ! -f "$f" ]; then
    echo "Missing $f. Run: bash infra/scripts/up.sh" >&2
    exit 1
  fi
done

mkdir -p "$TMP_DIR"
keys_path="$TMP_DIR/keys.json"

echo "Generating private keys (not printing them)..."

# Generate wallets using ethers from contracts/node_modules.
keys_json="$(
  cd "$ROOT_DIR/contracts"
  node -e "const {Wallet}=require('ethers'); const mk=()=>{const w=Wallet.createRandom(); return {address:w.address, privateKey:w.privateKey};}; console.log(JSON.stringify({guard:mk(), relayerL3:mk(), relayerL2:mk(), proposerL2:mk(), proposerL3:mk()}));"
)"

echo "$keys_json" >"$keys_path"

guard_pk="$(jq -r '.guard.privateKey' "$keys_path")"
relayer_l3_pk="$(jq -r '.relayerL3.privateKey' "$keys_path")"
relayer_l2_pk="$(jq -r '.relayerL2.privateKey' "$keys_path")"
proposer_l2_pk="$(jq -r '.proposerL2.privateKey' "$keys_path")"
proposer_l3_pk="$(jq -r '.proposerL3.privateKey' "$keys_path")"

guard_addr="$(jq -r '.guard.address' "$keys_path")"
relayer_l3_addr="$(jq -r '.relayerL3.address' "$keys_path")"
relayer_l2_addr="$(jq -r '.relayerL2.address' "$keys_path")"
proposer_l2_addr="$(jq -r '.proposerL2.address' "$keys_path")"
proposer_l3_addr="$(jq -r '.proposerL3.address' "$keys_path")"

echo "Writing keys into env files..."

perl -0777 -i -pe "s/^PRIVATE_KEY=.*$/PRIVATE_KEY=$guard_pk/m" "$guard_env"
perl -0777 -i -pe "s/^RELAYER_PRIVATE_KEY=.*$/RELAYER_PRIVATE_KEY=$relayer_l3_pk/m; s/^L2_RELAYER_PRIVATE_KEY=.*$/L2_RELAYER_PRIVATE_KEY=$relayer_l2_pk/m" "$relayer_env"
perl -0777 -i -pe "s/^PROPOSER_PRIVATE_KEY=.*$/PROPOSER_PRIVATE_KEY=$proposer_l2_pk/m" "$proposer_l2_env"
perl -0777 -i -pe "s/^PROPOSER_PRIVATE_KEY=.*$/PROPOSER_PRIVATE_KEY=$proposer_l3_pk/m" "$proposer_l3_env"

echo "Addresses:"
echo "  guard(l2):      $guard_addr"
echo "  relayer(l3):    $relayer_l3_addr"
echo "  relayer(l2):    $relayer_l2_addr"
echo "  proposer(l2->l1): $proposer_l2_addr"
echo "  proposer(l3->l2): $proposer_l3_addr"

echo "Pausing proposers during funding (avoids nonce collisions)..."
cd "$ROOT_DIR/.devcontainer"
docker compose stop ghost-rollup-proposer-l2 ghost-rollup-proposer-l3 >/dev/null 2>&1 || true

echo "Funding addresses on L1/L2/L3 from the default dev-funded account..."

fund_list="$(
  jq -cn \
    --arg a "$guard_addr" \
    --arg b "$relayer_l3_addr" \
    --arg c "$relayer_l2_addr" \
    --arg d "$proposer_l2_addr" \
    --arg e "$proposer_l3_addr" \
    '[ $a, $b, $c, $d, $e ]'
)"

(
  cd "$ROOT_DIR/contracts"
  FUND_AMOUNT_ETH="${FUND_AMOUNT_ETH:-10}" FUND_ADDRESSES_JSON="$fund_list" npx hardhat run --network anvil scripts/fund_addresses.ts >/dev/null
  FUND_AMOUNT_ETH="${FUND_AMOUNT_ETH:-10}" FUND_ADDRESSES_JSON="$fund_list" npx hardhat run --network ghostl2 scripts/fund_addresses.ts >/dev/null
  FUND_AMOUNT_ETH="${FUND_AMOUNT_ETH:-10}" FUND_ADDRESSES_JSON="$fund_list" npx hardhat run --network ghostl3 scripts/fund_addresses.ts >/dev/null
)

echo "Restarting services to pick up updated env..."
docker compose up -d --force-recreate ghost-guard ghost-relayer ghost-rollup-proposer-l2 ghost-rollup-proposer-l3 >/dev/null

echo "Done."
echo "Guard:   http://localhost:7070/health"
echo "Relayer: http://localhost:7171/health"
echo "PropL2:  http://localhost:7272/health"
echo "PropL3:  http://localhost:7373/health"
