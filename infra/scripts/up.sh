#!/usr/bin/env bash
set -euo pipefail

cd /workspaces/ghostl-stack/.devcontainer
docker compose up -d --build

echo "Waiting for RPCs..."
for url in http://localhost:8545 http://localhost:9545 http://localhost:10545; do
  for i in $(seq 1 60); do
    if curl -s -X POST "$url" \
      -H 'content-type: application/json' \
      --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' >/dev/null; then
      echo "OK: $url"
      break
    fi
    sleep 1
    if [ "$i" -eq 60 ]; then
      echo "RPC not responding: $url"
      exit 1
    fi
  done
done

echo "Deploying contracts..."
cd /workspaces/ghostl-stack/contracts
npm run deploy:all

echo "Done. Anvil=8545, L2=9545, L3=10545, Guard=7070"
