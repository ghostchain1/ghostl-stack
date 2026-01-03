#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/workspaces/ghostl-stack"
# Pin to a released build; `latest` drifts and can break existing chain data.
IMAGE="0xpolygon/polygon-edge:1.3.2"
NETWORK="devcontainer_ghostnet"
ROOTCHAIN_RPC="http://anvil-rpc-proxy:8546"
DEPLOYER_KEY_HEX="ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
# Must differ from the deployer address, otherwise TransparentUpgradeableProxy prevents initialization calls.
# Use a deterministic "uncontrolled" address for devnets to avoid proxy-admin call restrictions.
PROXY_CONTRACTS_ADMIN="0x1000000000000000000000000000000000000001"

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || { echo "Missing required command: $1" >&2; exit 1; }
}

need_cmd docker
need_cmd jq
need_cmd curl
need_cmd sudo
need_cmd node

cfg="$ROOT_DIR/chains/l2/chain.json"
data="$ROOT_DIR/chains/l2/data"

if [ ! -f "$cfg" ]; then
  echo "Missing config: $cfg" >&2
  exit 1
fi

echo "[l2 polybft] checking L1 (anvil) is up..."
for i in $(seq 1 90); do
  if curl -fsS -X POST http://localhost:8545 -H 'content-type: application/json' \
    --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' >/dev/null 2>&1; then
    break
  fi
  sleep 1
  if [ "$i" -eq 90 ]; then
    echo "[l2 polybft] L1 (anvil) RPC not responding on :8545" >&2
    exit 1
  fi
done

mkdir -p "$data"

# Ensure Polygon Edge can write (runs as uid=100 gid=101), and the workspace user can read.
sudo chmod 777 "$data" >/dev/null 2>&1 || true
sudo chown -R 100:101 "$data" >/dev/null 2>&1 || true
sudo chmod -R a+rwX "$data" >/dev/null 2>&1 || true

name="$(jq -r '.name' "$cfg")"
chain_id="$(jq -r '.chainId' "$cfg")"
premine_addr="$(jq -r '.premine.address' "$cfg")"
premine_amt="$(jq -r '.premine.amountWei' "$cfg")"
gas_limit="$(jq -r '.blockGasLimit' "$cfg")"
boot_ip="$(jq -r '.bootnodeIp' "$cfg")"
libp2p="$(jq -r '.libp2pPort' "$cfg")"

if [ ! -f "$data/.polybft_secrets" ]; then
  echo "[l2 polybft] generating PolyBFT validator secrets..."
  sudo rm -rf "$data/validator-1" >/dev/null 2>&1 || true
  docker run --rm --user 100:101 -v "$data:/data" "$IMAGE" \
    polybft-secrets --insecure --data-dir /data/validator-1 --num 1 >/dev/null
  sudo touch "$data/.polybft_secrets" || true
fi

if [ ! -f "$data/validator-1/consensus/validator.key" ]; then
  echo "[l2 polybft] validator secrets missing; regenerating..." >&2
  sudo rm -rf "$data/validator-1" >/dev/null 2>&1 || true
  docker run --rm --user 100:101 -v "$data:/data" "$IMAGE" \
    polybft-secrets --insecure --data-dir /data/validator-1 --num 1 >/dev/null
  sudo touch "$data/.polybft_secrets" || true
fi

# IMPORTANT: Anvil cannot be configured to add arbitrary accounts at genesis.
# Polygon Edge's PolyBFT rootchain finalization expects validators to exist on the rootchain,
# so we pin the validator ECDSA key to Anvil's default funded account.
printf "%s" "$DEPLOYER_KEY_HEX" | sudo tee "$data/validator-1/consensus/validator.key" >/dev/null
sudo chown 100:101 "$data/validator-1/consensus/validator.key" >/dev/null 2>&1 || true
sudo chmod 666 "$data/validator-1/consensus/validator.key" >/dev/null 2>&1 || true

node_id="$(
  docker run --rm --user 100:101 -v "$data:/data" "$IMAGE" \
    secrets output --data-dir /data/validator-1 --node-id | tail -n 1 | tr -d '\r\n'
)"
validator_addr="$(
  docker run --rm --user 100:101 -v "$data:/data" "$IMAGE" \
    secrets output --data-dir /data/validator-1 --validator | tail -n 1 | tr -d '\r\n'
)"

bootnode="/ip4/${boot_ip}/tcp/${libp2p}/p2p/${node_id}"

echo "[l2 polybft] generating genesis..."
if [ ! -f "$data/genesis.json" ]; then
  docker run --rm --user 100:101 -v "$data:/data" "$IMAGE" genesis \
    --dir /data/genesis.json \
    --name "$name" \
    --chain-id "$chain_id" \
    --consensus polybft \
    --validators-path /data \
    --validators-prefix validator- \
    --bootnode "$bootnode" \
    --premine "${premine_addr}:${premine_amt}" \
    --premine "${validator_addr}:${premine_amt}" \
    --premine "0x0000000000000000000000000000000000000000:${premine_amt}" \
    --proxy-contracts-admin "$PROXY_CONTRACTS_ADMIN" \
    --native-token-config "${name}:GHOSTL2:18:true:${premine_addr}" \
    --reward-wallet "${premine_addr}:1" \
    --block-gas-limit "$gas_limit" >/dev/null
else
  echo "[l2 polybft] genesis already exists; skipping genesis generation"
fi

# The genesis generator defaults validator multiAddr to tcp/30301; align it to the configured libp2p port.
sudo chmod 666 "$data/genesis.json" >/dev/null 2>&1 || true
tmp_gen="$data/genesis.json.tmp"
jq --arg ma "$bootnode" '
  if (.params.engine.polybft.initialValidatorSet | type) == "array" then
    .params.engine.polybft.initialValidatorSet = (.params.engine.polybft.initialValidatorSet | map(.multiAddr = $ma))
  else
    .
  end
' "$data/genesis.json" >"$tmp_gen"
mv "$tmp_gen" "$data/genesis.json"

sudo chmod -R a+rwX "$data" >/dev/null 2>&1 || true
sudo chown -R 100:101 "$data" >/dev/null 2>&1 || true

echo "[l2 polybft] deploying L1 rootchain stake token..."
stake_token="$(jq -r '.params.engine.polybft.bridge.stakeTokenAddr // empty' "$data/genesis.json" 2>/dev/null || true)"
if [ -z "$stake_token" ] || [ "$stake_token" = "0x0000000000000000000000000000000000000000" ]; then
  stake_json="$(
    cd "$ROOT_DIR/contracts"
    npx hardhat run --network anvil scripts/deploy_stake_token.ts
  )"
  stake_token="$(echo "$stake_json" | tail -n 1 | jq -r '.stakeToken')"
fi
if [ -z "$stake_token" ] || [ "$stake_token" = "null" ]; then
  echo "[l2 polybft] failed to deploy stake token" >&2
  echo "${stake_json:-}" >&2
  exit 1
fi
echo "[l2 polybft] stake token: $stake_token"

echo "[l2 polybft] deploying rootchain contracts on L1 (anvil) and writing config into genesis..."
if jq -e '.params.engine.polybft.bridge != null' "$data/genesis.json" >/dev/null 2>&1; then
  echo "[l2 polybft] polybft bridge block exists in genesis; continuing"
fi

stake_manager="$(jq -r '.params.engine.polybft.bridge.stakeManagerAddr // empty' "$data/genesis.json" 2>/dev/null || true)"
if [ -z "$stake_manager" ] || [ "$stake_manager" = "0x0000000000000000000000000000000000000000" ]; then
  echo "[l2 polybft] deploying stake manager on rootchain..."
  docker run --rm --network "$NETWORK" --user 100:101 -v "$data:/data" "$IMAGE" \
    --json polybft stake-manager-deploy \
    --jsonrpc "$ROOTCHAIN_RPC" \
    --genesis /data/genesis.json \
    --stake-token "$stake_token" \
    --proxy-contracts-admin "$PROXY_CONTRACTS_ADMIN" \
    --private-key "$DEPLOYER_KEY_HEX" >/dev/null

  stake_manager="$(jq -r '.params.engine.polybft.bridge.stakeManagerAddr // empty' "$data/genesis.json" 2>/dev/null || true)"
  if [ -z "$stake_manager" ] || [ "$stake_manager" = "0x0000000000000000000000000000000000000000" ]; then
    echo "[l2 polybft] stake manager deploy did not write stakeManagerAddr into genesis" >&2
    exit 1
  fi
fi

custom_supernet_mgr="$(jq -r '.params.engine.polybft.bridge.customSupernetManagerAddr // empty' "$data/genesis.json" 2>/dev/null || true)"
needs_rootchain_deploy=1
if [ -n "$custom_supernet_mgr" ] && [ "$custom_supernet_mgr" != "0x0000000000000000000000000000000000000000" ]; then
  needs_rootchain_deploy=0
fi

if [ "$needs_rootchain_deploy" -eq 0 ]; then
  echo "[l2 polybft] rootchain contracts already configured in genesis; skipping rootchain deploy/finalize"
else
  docker run --rm --network "$NETWORK" --user 100:101 -v "$data:/data" "$IMAGE" \
    --json rootchain deploy \
    --json-rpc "$ROOTCHAIN_RPC" \
    --genesis /data/genesis.json \
    --deployer-key "$DEPLOYER_KEY_HEX" \
    --stake-manager "$stake_manager" \
    --stake-token "$stake_token" \
    --proxy-contracts-admin "$PROXY_CONTRACTS_ADMIN" \
    >/dev/null

  supernet_manager="$(jq -r '.params.engine.polybft.bridge.customSupernetManagerAddr // empty' "$data/genesis.json" 2>/dev/null || true)"
  deployer_key="$DEPLOYER_KEY_HEX"

  if [ -z "$supernet_manager" ] || [ "$supernet_manager" = "0x0000000000000000000000000000000000000000" ]; then
    echo "[l2 polybft] Failed to determine supernet manager address from genesis after rootchain deploy." >&2
    exit 1
  fi

fi

supernet_manager="$(jq -r '.params.engine.polybft.bridge.customSupernetManagerAddr // empty' "$data/genesis.json" 2>/dev/null || true)"
if [ -n "$supernet_manager" ] && [ "$supernet_manager" != "0x0000000000000000000000000000000000000000" ]; then
  if [ ! -f "$data/.polybft_genesis_finalized" ]; then
    echo "[l2 polybft] finalizing genesis validator set on rootchain..."
    if docker run --rm --network "$NETWORK" --user 100:101 -v "$data:/data" "$IMAGE" \
      polybft supernet \
      --genesis /data/genesis.json \
      --jsonrpc "$ROOTCHAIN_RPC" \
      --supernet-manager "$supernet_manager" \
      --private-key "$DEPLOYER_KEY_HEX" \
      --finalize-genesis-set >/dev/null; then
      sudo touch "$data/.polybft_genesis_finalized" || true
    else
      echo "[l2 polybft] genesis set finalization failed" >&2
      exit 1
    fi
  fi
fi

sudo chmod -R a+rwX "$data" >/dev/null 2>&1 || true
sudo chown -R 100:101 "$data" >/dev/null 2>&1 || true

echo "[l2 polybft] done. bootnode=$bootnode validator=$validator_addr"
