# Ghostchain L1 (local dev chain)

The L1 for this stack is a standalone Ghostchain instance (dev geth) running on chainId 1337. It is independent of Ethereum mainnet/sepolia and is intended for local development and testing.

- RPC (inside compose): `http://l1:8545`
- RPC (host): `http://localhost:18545`
- Chain ID: `1337`
- Config files: `infra/opstack/config/l1-chain.json` (chain params), `infra/opstack/config/l1-genesis.json`
- Rollup config points to Ghostchain L1 via `infra/opstack/config/rollup.json` (l1_chain_id=1337, genesis hash matches Ghostchain).

Running:
```bash
docker compose -f infra/opstack/docker-compose.yml up -d l1
```

If you want to regenerate Ghostchain with a new chainId or genesis, update `infra/opstack/config/l1-chain.json` and `infra/opstack/config/l1-genesis.json`, clear `infra/opstack/data/l1-geth*`, and restart the stack.
