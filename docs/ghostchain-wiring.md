# GhostChain Wiring (L1/L2/L3)

Use this to point the dashboard/API at live GhostChain nodes.

## RPC endpoints
- Set in `apps/api/.env.local`:
  - `RPC_L1=https://<ghostchain-l1-rpc>`
  - `RPC_L2=https://<ghostlayer2-rpc>`
  - `RPC_L3=https://<ghostlayer3-rpc>`
- Optionally set `EXPLORER_RPC_URL` if you want a single default for explorer routes.

## API health route
- `GET /v1/ghostchain/health` (requires `chain:read`)
  - Returns chainId, latest block, and syncing status for L1/L2/L3 using the RPCs above.

## Services to point at GhostChain
- Bridge / transfers: `BRIDGE_SERVICE_URL`, `TRANSFER_SERVICE_URL`, `LIQUIDITY_SERVICE_URL`
- Contracts: `CONTRACT_REGISTRY_URL`, `CONTRACT_RISK_URL`, `CONTRACT_RPC_URL`
- Observability: `PROMETHEUS_URL`, `GRAFANA_URL`, `LOKI_URL`, `ALERTMANAGER_URL`
- Wallets/tokens: `WALLET_DB_PATH`, `TOKEN_DB_PATH` (SQLite) or set `WALLET_STORE_PATH`/`TOKEN_STORE_PATH` for JSON.

## Run dev
```bash
cd apps/api && cp .env.example .env.local  # edit RPC_L1/2/3, DB paths
npm run dev -w apps/api
npm run dev -w apps/web -- --hostname 0.0.0.0 --port 3200
```

## Notes
- Wallet/token routes: `/v1/wallets/*` plus `/v1/wallets/:id/tokens/import` and `/v1/wallets/:id/balances`.
- Bridge planner + wallet UI lives under `/wallet` in the dashboard; ensure API runs at `NEXT_PUBLIC_API_URL`.
