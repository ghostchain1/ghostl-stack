# Dashboard architecture (Next.js + Node)

Plan to stand up the web-based blockchain management dashboard using a Next.js App Router frontend and an Express/TypeScript API. Everything lives in a single repo to keep the UI, services, and shared contracts aligned with the existing GhostL stack.

## Monorepo layout
- `apps/web/` — Next.js 14 (App Router) with React Query + Zustand/Context for shell state.
- `apps/api/` — Express 4 + TypeScript; per-module routers/services; Zod validation.
- `packages/types/` — shared DTOs/interfaces (auth, chain, nodes, validators, explorer, tokenomics, contracts, bridge, ai, observability, devops, governance, integrations).
- `packages/config/` — env/config loader; per-env presets (local/dev/stage/prod).
- `packages/ui/` — shared UI primitives (sidebar/topbar/cards/forms/table) and icon set.
- `packages/auth/` — client/server helpers, RBAC guards, session management.
- `packages/clients/` — SDK-style clients for Guard/Relayer/Prometheus/Grafana/logs, etc.

## Frontend route map (App Router)
- `/` Dashboard redirect → Chain overview.
- `/login`, `/users`, `/api-keys`, `/sessions`.
- `/security` (overview/keys/vault/slashing/reports).
- `/chain` (overview/forks/peers/config).
- `/nodes`, `/nodes/[id]`, `/nodes/upgrades`, `/nodes/snapshots`.
- `/validators`, `/validators/[id]`, `/validators/power`, `/validators/finality`.
- `/explorer/mempool`, `/explorer/txs`, `/explorer/blocks`, `/explorer/address/[id]`.
- `/tokenomics/supply`, `/tokenomics/fees`, `/treasury`, `/treasury/payouts`, `/treasury/revenue`.
- `/contracts`, `/contracts/[address]`, `/contracts/admin`, `/contracts/analytics`.
- `/bridge`, `/bridge/transfers`, `/bridge/liquidity`, `/bridge/disputes`, `/bridge/emergency`.
- `/ai/security`, `/ai/wallets`, `/ai/sybil`, `/ai/forecasting`.
- `/observability/metrics`, `/observability/dashboards`, `/observability/logs`, `/observability/alerts`.
- `/devops/releases`, `/devops/forks`, `/devops/feature-flags`, `/devops/upgrades`, `/devops/rollbacks`.
- `/governance/proposals`, `/governance/votes`, `/governance/queue`, `/governance/delegation`.
- `/integrations/rpc`, `/integrations/usage`, `/integrations/webhooks`, `/integrations/partners`.

## API surface (Express, prefix `/api`)
- `auth`: `/auth/login`, `/auth/wallet`, `/auth/sessions`.
- `iam`: `/users`, `/roles`, `/api-keys`.
- `security`: `/security/risk`, `/security/keys`, `/security/vault`, `/security/slashing`, `/security/reports`.
- `chain`: `/chain/status`, `/chain/forks`, `/chain/peers`, `/chain/config`.
- `nodes`: `/nodes`, `/nodes/:id`, `/nodes/:id/health`, `/nodes/upgrades`, `/nodes/snapshots`.
- `validators`: `/validators`, `/validators/:id`, `/validators/:id/rewards`, `/validators/power`, `/validators/finality`.
- `explorer`: `/mempool/stream`, `/txs`, `/blocks`, `/entities/:id`.
- `tokenomics`: `/tokenomics/supply`, `/tokenomics/fees`, `/treasury`, `/treasury/payouts`, `/treasury/revenue`.
- `contracts`: `/contracts`, `/contracts/:address`, `/contracts/:address/admin`, `/contracts/:address/analytics`.
- `bridge`: `/bridge`, `/bridge/transfers`, `/bridge/liquidity`, `/bridge/disputes`, `/bridge/emergency`.
- `ai`: `/ai/anomalies`, `/ai/fraud`, `/ai/forecast`, `/ai/explain`.
- `observability`: `/observability/metrics`, `/observability/logs`, `/observability/alerts`, `/observability/dashboards`.
- `devops`: `/devops/releases`, `/devops/forks`, `/devops/feature-flags`, `/devops/upgrades`, `/devops/rollbacks`.
- `governance`: `/governance/proposals`, `/governance/votes`, `/governance/queue`, `/governance/delegation`.
- `integrations`: `/integrations/rpc`, `/integrations/usage`, `/integrations/webhooks`, `/integrations/partners`.

## Module scaffolding (per frontend module)
- `apps/web/src/modules/<module>/components/*`
- `apps/web/src/modules/<module>/services/*.ts` (frontend fetchers; thin React Query wrappers).
- `apps/web/src/modules/<module>/hooks/*.ts`
- `apps/web/src/modules/<module>/types.ts` (import from `packages/types` + UI-specific shapes).

## Backend scaffolding (per API module)
- `apps/api/src/modules/<module>/routes.ts` → `express.Router`.
- `apps/api/src/modules/<module>/controllers/*.ts` → bind Zod-validated handlers.
- `apps/api/src/modules/<module>/services/*.ts` → domain logic; adapter interfaces for data/telemetry.
- `apps/api/src/modules/<module>/models/*.ts` → Zod schemas + TypeScript types.
- `apps/api/src/rbac/policies.ts` → permission map; `requirePermission` middleware.
- `apps/api/src/lib` → logging, metrics emitters, cache, error wrappers, SSE/WebSocket helpers.

## RBAC roles (initial)
- `Viewer`: read-only.
- `Operator`: node/validator actions + mempool stream.
- `SecurityAdmin`: keys/vault/slashing/policies.
- `TreasuryAdmin`: treasury/payouts/revenue exports.
- `ProtocolAdmin`: fee model, forks, feature flags, devops releases/upgrades/rollbacks.
- `Developer`: contracts registry, webhooks, RPC endpoints, partner integrations.

## Early shared types (packages/types)
- `auth`: `User { id, email, wallets: string[], roles: string[] }`, `Role { id, name, permissions: string[] }`, `ApiKey`, `Session`.
- `chain`: `ChainInfo`, `EpochInfo`, `ReorgEvent`.
- `nodes`: `Node { id, type, host, version, status, lastSeenAt }`, `NodeMetrics { cpu, mem, disk, iops, peers, lag }`.
- `validators`: `Validator`, `SlashEvent`.
- `explorer`: `Tx`, `Block`.
- `tokenomics`: `SupplySnapshot`, `TreasuryTx`.
- `contracts`: `Contract`, `ContractCallStats`.
- `bridge`: `Transfer`, `BridgeControl`.
- `ai`: `Anomaly`, `Forecast`.
- `observability`: `Alert`, `LogEvent`.
- `devops`: `Release`, `ForkEvent`.
- `governance`: `Proposal`, `Vote`.
- `integrations`: `RpcEndpoint`, `Webhook`.

## Build order (phased)
1) **App shell + Auth/RBAC** — layout, session flow, role guard, shared types/ui/auth packages, `/auth/*` + `/users` + `/roles` + `/api-keys`.
2) **Chain overview + Nodes + Alerts** — `/chain/*`, `/nodes/*`, `/observability/alerts`; wire Prometheus/Grafana/log sources via `packages/clients`.
3) **Validators + Rewards** — `/validators/*`, participation/finality views.
4) **Explorer** — mempool stream (SSE/WebSocket), tx/block search with filters, entity tagging.
5) **Contracts + Bridge** — registry, admin controls, transfer lifecycle, emergency controls.
6) **Tokenomics + Treasury** — supply, fee model admin, payouts/revenue flows.
7) **AI/Forecasting** — anomaly/fraud scores, explainability, forecasting.
8) **Governance + DevOps** — proposals/votes/queue; releases/forks/feature flags/upgrades/rollbacks.

## Notes for integration
- Reuse existing observability stack: wrap Prometheus/Grafana/log sources in `packages/clients` and expose via `/observability/*`.
- Guard/Relayer APIs can be proxied through the `apps/api` layer with RBAC + audit logging for write endpoints.
- Prefer SSE/WebSocket for mempool/alerts streams; keep REST for historical queries and admin actions.
