#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="${ROOT_DIR:-$(cd "$SCRIPT_DIR/../.." && pwd)}"

echo "Starting workspace + L1 (anvil)..."
cd "$ROOT_DIR/.devcontainer"
docker compose up -d --build workspace anvil anvil-rpc-proxy

echo "Initializing GhostL2 as PolyBFT (anchored to L1)..."
bash "$ROOT_DIR/infra/scripts/chains/init_polybft_l2.sh"

echo "Initializing GhostL3 (IBFT dev chain)..."
bash "$ROOT_DIR/infra/scripts/chains/init.sh" l3

echo "Starting chains..."
cd "$ROOT_DIR/.devcontainer"
docker compose up -d --build ghostl2 ghostl3

echo "Waiting for RPCs..."
for url in http://localhost:8545 http://localhost:9545 http://localhost:10545; do
  for i in $(seq 1 90); do
    if curl -s -X POST "$url" -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' >/dev/null; then
      echo "OK: $url"
      break
    fi
    sleep 1
    if [ "$i" -eq 90 ]; then
      echo "RPC not responding: $url"
      exit 1
    fi
  done
done

echo "Deploying contracts..."
cd "$ROOT_DIR/contracts"
npm run deploy:all

echo "Starting services (Guard/Relayer/Rollup/Obs)..."
cd "$ROOT_DIR/.devcontainer"
docker compose up -d --build ghost-guard ghost-relayer ghost-rollup-proposer-l2 ghost-rollup-proposer-l3 ghost-rollup-challenger-l2 ghost-rollup-challenger-l3 prometheus grafana

echo "Done. Run: bash infra/scripts/keys/init.sh"
