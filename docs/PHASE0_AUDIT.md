# Phase 0 Audit

## Repo Structure
- Next.js app: `apps/web` (Next 15, App Router).
- Backend API: `apps/api` (Express 5, default `PORT=4000`).
- Services: `services/*` (bridge, validator, governance, treasury, ghost-registry, observability-related, etc.).
- Docker Compose files:
  - `docker-compose.dev.yml` (ghostl-web on 3200, ghostl-api on 4000).
  - `services/*/docker-compose.yml` (per-service stack).
  - `observability/infra/docker-compose.yml` (Prometheus/Grafana/Loki/Alertmanager).
  - `infra/opstack/*` and `infra/ghostchain/*` (chain/RPC stacks).

## Existing Endpoints (Current)
- API base: `http://localhost:4000` (from `apps/api/src/server.ts` and `apps/web/src/lib/runtime.ts`).
- UI base: `http://localhost:3200`.
- Explorer: `/v1/explorer/blocks`, `/v1/explorer/txs`, `/v1/explorer/mempool` (RPC-backed).
- Observability: `/v1/observability/*` and `/v1/stack/*` (Prometheus/Grafana/Loki/Alertmanager).
- Contracts: `/v1/api/contracts`, `/v1/api/contracts/*` (registry + local store).
- RPC registry: `RPC_REGISTRY_URL` (defaults to `https://rpc.ghostchain.cloud/v1/endpoints`, overridden in `services/stack.env`).

## Pages Observed Empty / Blank: Exact Causes
- Web UI not running: `/tmp/ghostl-web.log` shows `EADDRINUSE` on port 3200, so the UI never starts.
  - Fix: free port 3200 or change `PORT` for `apps/web`.
- Login “Failed to fetch”: `apps/web` defaults to `NEXT_PUBLIC_API_URL=http://localhost:4000` when unset.
  - If API is down, or running on a different port, `/api/auth/login` fails at the network layer.
  - Fix: ensure `apps/api` is running on 4000 or set `NEXT_PUBLIC_API_URL` + `API_INTERNAL_URL`.
- CORS mismatch: `docker-compose.dev.yml` sets `CORS_ALLOW_ORIGINS=http://localhost:3200`.
  - Accessing UI via `127.0.0.1`, WSL hostnames, or LAN IP blocks cookies and requests.
  - Fix: add the exact origin(s) used in the browser to `CORS_ALLOW_ORIGINS`.
- Contracts page shows “No contracts in registry”:
  - `/v1/api/contracts` pulls from `CONTRACT_REGISTRY_URL` (default `http://localhost:7608`) and merges local `data/contracts-registry.json`.
  - If contract-registry service is down and local registry file is empty or not mounted, UI has zero rows.
  - Fix: run `contract-registry-service` or seed via `/v1/api/contracts/seed` or `/v1/api/contracts/register` and ensure `DATA_DIR` is persisted.
- Observability / Alerts / Logs pages empty:
  - `PROMETHEUS_URL`, `GRAFANA_URL`, `LOKI_URL`, `ALERTMANAGER_URL` default to localhost ports in `apps/api/.env.example`.
  - If those containers are not running or unreachable from the API container, API returns empty data or errors.
  - Fix: start `observability/infra/docker-compose.yml` or point env to reachable endpoints.
- Bridge / Governance / Treasury / DevOps / Validators pages empty:
  - API proxies to service URLs (`servicesBase.*`) and uses `proxyJson` fallback to empty arrays on failure.
  - When services are down, API returns empty data with HTTP 200, so UI looks blank.
  - Fix: run per-service compose files under `services/*/docker-compose.yml` or change proxy behavior to emit errors (later phases).
- Explorer / Wallet / Chain data empty:
  - RPC endpoints default to `localhost` or `host.docker.internal` (from `apps/api/.env.example` and `services/stack.env`).
  - If RPC nodes are not running or `host.docker.internal` is not resolvable, RPC calls fail or return zeros.
  - Fix: start chain RPCs (infra/opstack or ghostchain) or update `RPC_L1/RPC_L2/RPC_L3`.
- RBAC gating returns empty UI:
  - Many API routes require permissions; unauthenticated calls return 401/403 and server components redirect to `/login`.
  - Fix: log in with a user that has the required role(s) or set PUBLIC_* flags for read-only access.
- UI uses direct RPC calls (violates current rules):
  - `apps/web/src/modules/overview/OperatorOverview.tsx` uses `rpcCall` directly to RPC URLs.
  - Fix: replace with ghost-api `/chain` + `/explorer` summaries and remove `apps/web/src/lib/rpc.ts`.
- UI hardcodes RPC defaults in network context:
  - `apps/web/src/modules/app-shell/services/NetworkContextService.tsx` defaults to `NEXT_PUBLIC_L1_RPC/L2/L3` and localhost fallbacks.
  - Fix: pull RPCs from ghost-api only and remove hardcoded fallbacks; use registry data for display.
- Wallet + token + NFT UI allow direct RPC overrides:
  - Wallet balance/metadata requests include `rpc` from UI; must be validated against registry (backend now enforces for token import + wallet balance).
  - Fix: expose registry endpoints as selectable options (no free-text RPC) and show errors when registry lacks RPCs.
- Chain data is single-chain only:
  - `liveServices.chain` returns one chain (default L2) from env; no multi-chain summary exists.
  - Fix: ghost-api should return per-chain summaries using registry + RPC sampling, or error per chain.
- UI routes still target legacy API paths:
  - Several pages call `/api/*`, `/v1/*`, and `/stack/*` endpoints that are not implemented in the new ghost-api summary surface.
  - Result: 404 responses or empty data, leading to blank tables/cards.
  - Fix: rewire all UI data fetches to `/chain`, `/nodes`, `/validators`, `/bridge`, `/wallet`, `/explorer`, `/contracts`, `/tokenomics`, `/treasury`, `/governance`, `/compliance`, `/kyc`, `/devops`, `/integration`, `/ai`, `/users`, `/observability`.
- Network selector uses deprecated RPC pool:
  - `NetworkContextService` calls `/rpc/pool` and expects `{ pool: { L1/L2/L3 } }`.
  - ghost-registry now exposes `/v1/endpoints` and ghost-api provides chain summaries; `/rpc/pool` may be missing.
  - Fix: populate networks from ghost-api `/chain` and remove all `NEXT_PUBLIC_L1_RPC/L2/L3` defaults.

## Summary Fix Path (No Implementation Yet)
- Ensure web + API are both running and reachable (`3200` + `4000`).
- Align `NEXT_PUBLIC_API_URL`, `API_INTERNAL_URL`, and `CORS_ALLOW_ORIGINS`.
- Bring up required docker-compose stacks for RPCs, services, and observability.
- Seed contract registry and token/wallet stores, or connect live services.
 - Remove direct RPC calls in UI and rewire to ghost-api summaries.
 - Ensure all RPCs come from ghost-registry and surface per-chain failures explicitly.
