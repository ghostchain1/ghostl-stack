# Services Index

Lightweight overview of the service stubs that back the dashboard modules. Most services are Node/Express shells waiting on real integrations—keep names and domains aligned with `apps/web/src/modules/*` and the API routers under `apps/api/src/modules/*`.

## Core rollup + bridge
- `ghost-guard`, `ghost-relayer`, `ghost-rollup-proposer`, `ghost-rollup-challenger`, `ghost-rpc-proxy`: enforcement, relaying, and rollup batch posting to parent chains.
- `bridge-service`, `transfer-lifecycle-service`, `liquidity-service`, `dispute-service`: bridge state, transfers, pools, and dispute/fraud handling.

## Chain, nodes, and ops
- `chain-status-service`, `consensus-telemetry-service`, `peer-graph-service`: chain health, consensus metrics, and peer topology.
- `node-inventory-service`, `node-health-service`: node catalog + liveness/resource probes.
- `snapshot-service`, `upgrade-orchestrator-service`: pruning/snapshot controls and rollout automation.
- `network-context-service`, `ghost-rpc-proxy`: RPC routing / environment context helpers.

## Validators and staking
- `validator-service`, `staking-service`, `rewards-service`, `participation-service`, `slashing-detection-service`: validator sets, stake, payouts, participation, and slash detection.

## Tokenomics and treasury
- `supply-service`, `fee-model-service`, `treasury-service`, `payout-service`: supply dashboards, fee rules, multisig treasury, and payouts.

## Contracts and security
- `contract-registry-service`, `verification-service`, `proxy-inspector-service`, `contract-risk-service`: registry, verification, proxy/upgradability checks, and risk scoring.
- `key-rotation-service`, `secrets-health-service`, `compliance-export-service`: key lifecycle, secrets/health probes, and compliance exports.

## Observability and notifications
- `alerts-service`, `notifications-service`, `ai-monitor`: alert rules, channel routing, and synthetic monitors.
- `mempool-service`, `block-index-service`, `tx-index-service`, `entity-tagging-service`: explorer/indexing feeds for dashboard tables.

## Identity, governance, and UX
- `auth-service`, `session-service`, `rbac-service`, `audit-log-service`: authn/z, sessions, and audit trails.
- `governance-service`: on-chain governance view.
- `command-palette-service`, `global-search-service`, `feature-flags-service`, `theme-service`: UI shell helpers and settings.
- `anomaly-detection-service`, `forecasting-service`, `explainability-service`: AI/ML hooks (risk/anomaly scores, forecasts, explanations).

Conventions:
- Keep service README/config close to the service folder (same name) and expose a `/health` endpoint for `apps/api`.
- Use `package.json` scripts (`dev`, `start`) that match the existing stubs so workspaces can orchestrate them uniformly later.
- Build services sequentially to avoid resource contention: `./scripts/build-services-sequential.sh`.
