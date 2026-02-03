# Backend Capabilities Map

Generated from code inspection in `apps/api/src` and `services/*/src`.

## apps/api (PORT=4000)

Base URL: `http://localhost:4000` (env `PORT`).
Auth: httpOnly session cookies; most routes use `requirePermission(...)` or guards (`integrationsReadGuard`, `validatorGuard`, `explorerGuard`).
Dependencies: downstream service base URLs from `services/stack.env` (`servicesBase.*`), Prometheus/Grafana/Loki/Alertmanager clients, GhostWallet service, RPC endpoints.

| Endpoint | Description | Auth | Request schema | Response schema |
| --- | --- | --- | --- | --- |
| POST `/auth/register` | Public signup (if enabled). | none | `{ email: string, password: string, createWallet?: boolean }` | `{ session, user, permissions, csrfToken }` or `{ error }` |
| POST `/auth/bootstrap` | Bootstrap admin with setup token. | setup token | `{ email, password, token }` | `{ session, user, permissions, csrfToken }` or `{ error }` |
| POST `/api/auth/login` | Login (email/password). | none | `{ email, password }` | `{ session, user, permissions, csrfToken }` or `{ error }` |
| POST `/auth/login/password` | Password login (legacy alias). | none | `{ email, password }` | `{ session, user, permissions, csrfToken }` or `{ error }` |
| POST `/auth/login/sso` | SSO login. | none | `{ token }` | `{ session, user, permissions, csrfToken }` or `{ error }` |
| POST `/auth/logout` | Logout. | session | none | `{ ok: true }` |
| POST `/api/auth/logout` | Logout (API path). | session | none | `{ ok: true }` |
| GET `/auth/session` | Current session metadata. | session | none | `{ session, user, permissions, csrfToken }` or `{ error }` |
| GET `/api/auth/me` | Current user. | session | none | `{ user, permissions, csrfToken }` or `{ error }` |
| GET `/users` | List users. | `iam:read` | none | `User[]` |
| POST `/users` | Create user. | `iam:write` | `{ email, password?, roles? }` | `User` |
| PATCH `/users/:id` | Update user. | `iam:write` | `{ email?, roles?, password?, locked? }` | `User` |
| GET `/roles` | List roles. | `iam:read` | none | `Role[]` |
| POST `/roles` | Create role. | `iam:write` | `{ name, permissions }` | `Role` |
| PATCH `/roles/:id` | Update role. | `iam:write` | `{ name?, permissions? }` | `Role` |
| DELETE `/roles/:id` | Delete role. | `iam:write` | none | `{ ok: true }` |
| GET `/api-keys` | List API keys. | `iam:read` | none | `ApiKey[]` |
| POST `/api-keys` | Create API key. | `iam:write` | `{ name, scopes }` | `ApiKey` |
| DELETE `/api-keys/:id` | Revoke API key. | `iam:write` | none | `{ ok: true }` |
| GET `/audit` | Audit log entries. | `iam:read` | none | `AuditLogEntry[]` |
| GET `/feature-flags` | Feature flags. | session | none | `Record<string, boolean>` |
| POST `/feature-flags/:key` | Toggle feature flag. | session | `{ enabled: boolean }` | `{ ok: true }` |
| GET `/network` | Current network context. | session | none | `{ current, available }` |
| GET `/network/available` | Available networks. | session | none | `{ networks }` |
| POST `/network` | Set active network. | session | `{ chainId }` | `{ ok: true, current }` |
| GET `/theme` | Theme config. | session | none | `{ theme }` |
| POST `/theme` | Update theme. | session | `{ theme }` | `{ ok: true }` |
| GET `/stack/overview` | Stack overview metrics. | session | `?chain=l2|l3` | `{ chain, head, finalized, lag, relayer?, guard? }` |
| GET `/chain/status` | Chain status. | session | none | `{ info, epoch, blockTimeMs, finalityLag, reorgs }` |
| GET `/chain/peers` | Peer graph snapshot. | session | none | `{ peers, topology }` |
| GET `/chain/telemetry` | Consensus telemetry. | session | none | `{ participation, latency, health }` |
| GET `/nodes` | Node inventory. | session | none | `Node[]` |
| GET `/nodes/:id` | Node detail + metrics. | session | none | `{ node, metrics }` |
| GET `/nodes/:id/logs` | Node logs. | session | `?limit` | `LogEvent[]` |
| POST `/nodes/:id/restart` | Restart node. | `devops:write` | `{ reason? }` | `{ ok: true }` |
| POST `/nodes/:id/upgrade` | Upgrade node. | `devops:write` | `{ version }` | `{ ok: true }` |
| GET `/observability/metrics` | Prometheus query. | `observability:read` unless `PUBLIC_OBSERVABILITY` | `?q&rangeStart&rangeEnd&step` | Prometheus query result |
| GET `/observability/dashboards` | Grafana dashboards list. | `observability:read` unless public | none | `{ id, name, url }[]` |
| GET `/observability/alerts` | Alert rules list. | `observability:read` unless public | none | `Alert[]` |
| POST `/observability/alerts` | Create alert rule / proxy. | `observability:read` unless public | `Alert` payload | `Alert` |
| GET `/observability/logs` | Loki log search. | `observability:read` unless public | `?q&limit&start&end` | `LogEvent[]` |
| GET `/observability/logs/stream` | SSE log tail. | `observability:read` unless public | `?q` | SSE stream |
| GET `/observability/logs/api/query` | Normalized log search. | `observability:read` unless public | `?q&layers&chains&components&severities&start&end&limit` | `NormalizedLogEvent[]` |
| GET `/observability/logs/api/stream` | Normalized log stream (SSE). | `observability:read` unless public | `?q&layers&chains&components&severities` | SSE stream |
| GET `/observability/logs/api/aggregate` | Log aggregation. | `observability:read` unless public | `?groupBy&...filters` | `LogAggregateResult` |
| GET `/observability/logs/api/incidents` | Log incident summaries. | `observability:read` unless public | `?filters` | `{ incidents: LogIncident[] }` |
| GET `/observability/logs/api/insights` | AI log insight report. | `observability:read` unless public | `?filters` | `LogInsightReport` |
| GET `/observability/logs/api/correlation` | Trace correlation data. | `observability:read` unless public | `?filters` | `{ traces, layerCounts, total }` |
| GET `/observability/logs/api/critical` | Critical log ledger. | `observability:read` unless public | `?limit` | `{ records: CriticalLogRecord[] }` |
| GET `/observability/logs/api/metrics` | Log-derived Prometheus metrics. | `observability:read` unless public | `?filters` | Prometheus text |
| GET `/observability/channels` | Notification channels. | `observability:read` unless public | none | `Channel[]` |
| POST `/observability/channels/test` | Test notification channels. | `observability:write` | `{ channels: string[], alert? }` | `{ ok: true }` |
| GET `/observability/incidents` | Incident summary. | `observability:read` | none | `{ ok: true, incidents: BridgeIncident[] }` |
| GET `/wallets` | Wallet list. | `wallets:read` | none | `WalletRecord[]` |
| GET `/wallets/:id` | Wallet detail. | `wallets:read` | none | `WalletRecord` |
| POST `/wallets` | Create watch wallet. | `wallets:write` | `{ label, address, chainId, ownerUserId? }` | `WalletRecord` |
| POST `/wallets/import` | Import wallet (mnemonic/private key). | `wallets:write` | `{ label, chainId, secret }` | `WalletRecord` |
| POST `/wallets/custodial` | Create custodial wallet. | `wallets:write` | `{ label, chainId, ownerUserId? }` | `WalletRecord` |
| POST `/wallets/ghost/import` | Import GhostWallet JSON. | `wallets:write` | `{ label, chainId, payload }` | `WalletRecord` |
| POST `/wallets/:id/rotate` | Rotate wallet key. | `wallets:write` | `{ reason? }` | `WalletRecord` |
| PATCH `/wallets/:id` | Update wallet. | `wallets:write` | `{ label?, ownerUserId? }` | `WalletRecord` |
| DELETE `/wallets/:id` | Delete wallet. | `wallets:write` | none | `{ ok: true }` |
| GET `/wallets/:walletId/tokens` | Wallet token list. | `wallets:read` | none | `TokenRecord[]` |
| GET `/wallets/:walletId/balances` | Token balances. | `wallets:read` | `?chain` | `{ balances, chain }` |
| POST `/wallets/:walletId/tokens/import` | Import token. | `wallets:write` | `{ address, chainId, type?, rpc? }` | `TokenRecord` |
| DELETE `/wallets/:walletId/tokens/:tokenId` | Remove token. | `wallets:write` | none | `{ ok: true }` |
| GET `/wallet/token/balance` | Token balance by chain. | `wallets:read` | `?address&chainId&token` | `{ balance, decimals }` |
| POST `/wallet/send` | Transfer native/token. | `wallets:write` | `{ from, to, amount, chainId }` | `{ hash }` |
| POST `/wallet/fund` | Faucet fund. | `wallets:write` | `{ address, amount, chainId }` | `{ ok: true, hash }` |
| GET `/wallet/tx/receipt` | Tx receipt. | `wallets:read` | `?hash&chainId` | `{ status, blockNumber, gasUsed, effectiveGasPrice, from, to }` |
| POST `/wallet/sign-message` | Sign message. | `wallets:write` | `{ walletId, message }` | `{ signature }` |
| POST `/wallet/sign-transaction` | Sign transaction. | `wallets:write` | `{ walletId, tx }` | `{ signedTransaction }` |
| POST `/wallet/bridge` | Bridge transfer. | `wallets:write` | `{ from, to, amount, chainId, targetChainId }` | `{ ok: true, hash }` |
| POST `/wallet/swap` | Swap via router. | `wallets:write` | `{ from, to, amount, chainId, route }` | `{ ok: true, hash }` |
| GET `/swap/quote` | Swap quote. | session | `?amount&from&to&chainId` | `{ routes }` |
| POST `/swap/execute` | Execute swap. | session | `{ route, amount, recipient? }` | `{ ok: true, hash }` |
| GET `/rpc/pool` | RPC pool snapshot. | `integrations:read` | none | `{ pool: { L1, L2, L3 } }` |
| GET `/integrations/definitions` | Integration definitions. | `integrations:read` | none | `{ definitions }` |
| GET `/integrations/instances` | Integration instances. | `integrations:read` | none | `{ instances }` |
| GET `/integrations/instances/:id` | Integration instance. | `integrations:read` | none | `{ instance }` |
| POST `/integrations/instances` | Create integration instance. | `integrations:write` | `{ definitionId, config }` | `{ instance }` |
| PATCH `/integrations/instances/:id` | Update integration instance. | `integrations:write` | `{ config, enabled? }` | `{ instance }` |
| POST `/integrations/instances/:id/enable` | Enable/disable integration. | `integrations:write` | `{ enabled }` | `{ instance }` |
| POST `/integrations/instances/:id/test` | Test integration. | `integrations:write` | `{}` | `{ ok: true, result? }` |
| GET `/integrations/rpc` | RPC integration view. | session | none | `RpcEndpoint[]` |
| GET `/api/bridge` | Bridge summary. | `bridge:read` | none | `{ ok: true, networks, signatures }` |
| GET `/api/bridge/incidents` | Bridge incidents. | `bridge:write` | none | `{ ok: true, incidents }` |
| POST `/api/bridge/incidents` | Create bridge incident. | `bridge:write` | `{ message, severity }` | `{ ok: true, incident }` |
| POST `/api/bridge/pause` | Pause bridge. | `bridge:write` | `{ chain }` | `{ ok: true }` |
| POST `/api/bridge/resume` | Resume bridge. | `bridge:write` | `{ chain }` | `{ ok: true }` |
| GET `/api/bridge/fees` | Bridge fee config. | `bridge:write` | none | `{ ok: true, fees }` |
| POST `/api/bridge/fees` | Update bridge fees. | `bridge:write` | `{ chain, fee }` | `{ ok: true }` |
| GET `/api/contracts` | Contracts list. | `contracts:read` | none | `{ ok: true, contracts }` |
| GET `/api/contracts/state` | Contract states. | `contracts:read` | none | `{ ok: true, states }` |
| POST `/api/contracts/pause` | Pause contract. | `contracts:write` | `{ address }` | `{ ok: true }` |
| POST `/api/contracts/resume` | Resume contract. | `contracts:write` | `{ address }` | `{ ok: true }` |
| POST `/api/contracts/upgrade` | Upgrade contract. | `contracts:write` | `{ address, implementation }` | `{ ok: true }` |
| POST `/api/contracts/transfer-ownership` | Transfer ownership. | `contracts:write` | `{ address, newOwner }` | `{ ok: true }` |
| POST `/api/contracts/set-guardian` | Set guardian. | `contracts:write` | `{ address, guardian }` | `{ ok: true }` |
| POST `/api/contracts/execute` | Execute admin call. | `contracts:write` | `{ address, data }` | `{ ok: true }` |
| GET `/api/token` | Tokenomics snapshot. | `treasury:read` | none | `{ networks, feeModel }` |
| GET `/api/treasury/proposals` | Treasury proposals. | `treasury:read` | none | `{ proposals }` |
| POST `/api/treasury/approve` | Approve treasury proposal. | `treasury:write` | `{ proposalId }` | `{ ok: true }` |
| GET `/governance/proposals` | Governance proposals. | `governance:read` | none | `{ proposals }` |
| GET `/governance/votes` | Governance votes. | `governance:read` | none | `{ votes }` |
| GET `/governance/queue` | Governance execution queue. | `governance:read` | none | `{ queue }` |
| GET `/governance/delegations` | Delegations. | `governance:read` | none | `{ delegations }` |
| GET `/governance/snapshot` | Governance snapshot. | `governance:read` | none | `{ snapshot }` |
| GET `/governance/forum` | Governance forum feed. | `governance:read` | none | `{ posts }` |
| GET `/devops/upgrade-plans` | Upgrade plans. | `devops:read` | none | `{ plans }` |
| POST `/devops/upgrade-plans` | Create upgrade plan. | `devops:write` | `{ name, steps }` | `UpgradePlan` |
| POST `/devops/upgrade-plans/:id/steps/:stepId` | Update step status. | `devops:write` | `{ status }` | `UpgradePlan` |
| POST `/devops/upgrade-plans/:id/approve` | Approve upgrade plan. | `devops:write` | none | `UpgradePlan` |
| POST `/devops/upgrade-plans/:id/execute` | Execute upgrade plan. | `devops:write` | none | `UpgradePlan` |
| POST `/devops/rollback/:id` | Create rollback plan. | `devops:write` | `{ reason }` | `UpgradePlan` |
| POST `/devops/rollback/:id/execute` | Execute rollback. | `devops:write` | none | `UpgradePlan` |
| GET `/devops/releases` | Release history. | `devops:read` | none | `{ releases }` |
| GET `/devops/forks` | Fork events. | `devops:read` | none | `{ forks }` |
| GET `/devops/upgrades` | Upgrade history. | `devops:read` | none | `{ upgrades }` |
| GET `/compliance/reports` | Compliance reports. | `iam:read` | none | `{ reports }` |
| GET `/compliance/reports/:id` | Compliance report detail. | `iam:read` | none | `ComplianceDetail` |
| POST `/compliance/reports` | Generate compliance report. | `iam:write` | `{ period }` | `{ report }` |
| GET `/compliance/reports/:id/export` | Export compliance report. | `iam:read` | `?format=csv` | `text/csv` |
| GET `/security/controls` | Security control status. | `iam:read` | none | `{ vaultHealthy, vaultUrl, hsmHealthy, hardwareWalletRequired }` |
| GET `/api/validators` | Validator list. | `validatorGuard` | none | `{ validators }` |
| GET `/api/validators/metrics` | Validator metrics. | `validatorGuard` | none | `{ metrics }` |
| GET `/explorer/blocks` | Block list. | `explorerGuard` | `?chain&limit` | `{ blocks }` |
| GET `/explorer/mempool` | Mempool. | `explorerGuard` | `?chain` | `{ mempool }` |
| GET `/explorer/txs` | Transaction list. | `explorerGuard` | `?chain&limit` | `{ txs }` |
| GET `/wallet/balance` | Wallet balance view. | session | `?address&chainId` | `{ balance }` |
| GET `/health` | API health and dependency status. | none | none | `{ status, dependencies, upstream }` |
| POST `/analytics/events` | Record analytic event. | session | `{ scope, event, payload }` | `{ ok: true }` |
| GET `/analytics/events` | Analytics events. | admin | `?scope&limit` | `{ events }` |
| GET `/webhooks/status` | Webhook status. | admin | none | `{ status }` |
| GET `/webhooks/deliveries` | Webhook deliveries. | admin | `?limit` | `{ deliveries }` |
| POST `/webhooks/alerts` | Alert webhook receiver. | admin | Alertmanager webhook payload | `{ ok: true }` or `{ error }` |

### KYC router (`/kyc/*`)

| Endpoint | Description | Auth | Request schema | Response schema |
| --- | --- | --- | --- | --- |
| GET `/kyc/summary` | KYC summary. | `kyc:read` | none | `KycSummary` |
| GET `/kyc/policy` | KYC policy. | `kyc:read` | none | `KycPolicy` |
| PATCH `/kyc/policy` | Update KYC policy. | `kyc:write` | `KycPolicy` | `KycPolicy` |
| GET `/kyc/providers` | KYC providers. | `kyc:read` | none | `{ providers: KycProvider[] }` |
| GET `/kyc/applicants` | Applicant list. | `kyc:read` | `?status&risk&type&search` | `KycApplicant[]` |
| POST `/kyc/applicants` | Create applicant. | `kyc:write` | `KycApplicantInput` | `KycApplicant` |
| GET `/kyc/applicants/:id` | Applicant detail. | `kyc:read` | none | `KycApplicant` |
| PATCH `/kyc/applicants/:id` | Update applicant. | `kyc:write` | `Partial<KycApplicant>` | `KycApplicant` |
| POST `/kyc/applicants/:id/assign` | Assign reviewer. | `kyc:write` | `{ reviewer }` | `{ ok: true }` |
| POST `/kyc/applicants/:id/documents` | Upload document. | `kyc:write` | `{ name, type }` | `{ ok: true, document }` |
| POST `/kyc/applicants/:id/documents/:docId/review` | Review document. | `kyc:write` | `{ status, notes }` | `{ ok: true }` |
| POST `/kyc/applicants/:id/review` | Final review. | `kyc:write` | `{ decision, notes }` | `{ ok: true }` |
| POST `/kyc/applicants/:id/risk` | Update risk. | `kyc:write` | `{ risk, reason }` | `{ ok: true }` |

### AI router (`/ai/*`)

| Endpoint | Description | Auth | Request schema | Response schema |
| --- | --- | --- | --- | --- |
| GET `/ai/modules` | Supported AI modules. | `ai:read` (guard) | none | `{ modules }` |
| GET `/ai/tx-intel` | Transaction intel. | `ai:read` | `?chain&txHash` | `{ ok, intel, confidence, explainability }` |
| GET `/ai/wallet-intel` | Wallet intel. | `ai:read` | `?chain&address` | `{ ok, intel, confidence, explainability }` |
| GET `/ai/contract-intel` | Contract intel. | `ai:read` | `?chain&address` | `{ ok, intel, confidence, explainability }` |
| GET `/ai/network-intel` | Network intel. | `ai:read` | `?chain` | `{ ok, intel, confidence, explainability }` |
| GET `/ai/bridge-intel` | Bridge intel. | `ai:read` | `?chain` | `{ ok, intel, confidence, explainability }` |
| GET `/ai/governance-intel` | Governance intel. | `ai:read` | `?chain` | `{ ok, intel, confidence, explainability }` |
| GET `/ai/forecasting` | Forecasting. | `ai:read` | `?chain` | `{ ok, forecast, confidence }` |
| GET `/ai/explain` | Explainability. | `ai:read` | `?model&prompt` | `{ ok, output, references }` |

## services/*

All services use Express with JSON responses and no auth middleware. Most return `{ ok: true }` for `/health`. Dependencies include Prometheus (`PROM_URL`), RPC endpoints (`RPC_L2`, `RPC_L3`), and external nodes.

### alerts-service (PORT=7644)

| Endpoint | Description | Auth | Request schema | Response schema |
| --- | --- | --- | --- | --- |
| GET `/health` | Health check. | none | none | `{ ok: true, service: "alerts-service" }` |
| GET `/alerts` | Alert summary from Prometheus. | none | none | `{ ok: true, alerts: [], stats: { guardAlerts, challengerAlerts } }` |

Dependencies: Prometheus (`PROM_URL`).

### anomaly-detection-service (PORT=7616)

| Endpoint | Description | Auth | Request schema | Response schema |
| --- | --- | --- | --- | --- |
| GET `/health` | Health check. | none | none | `{ ok: true, service: "anomaly-detection-service" }` |
| GET `/anomalies` | AI anomaly list. | none | none | `{ ok: true, anomalies: { id, entity, score, reasons, time }[] }` |

Dependencies: Prometheus (`PROM_URL`).

### audit-log-service (PORT=7641)

| Endpoint | Description | Auth | Request schema | Response schema |
| --- | --- | --- | --- | --- |
| GET `/health` | Health check. | none | none | `{ ok: true, service: "audit-log-service" }` |
| GET `/logs` | Audit log list. | none | none | `{ ok: true, logs: { actor, action, resource, createdAt }[] }` |

### auth-service (PORT=7639)

| Endpoint | Description | Auth | Request schema | Response schema |
| --- | --- | --- | --- | --- |
| GET `/health` | Health check. | none | none | `{ ok: true, service: "auth-service" }` |
| GET `/auth/nonce` | Login nonce. | none | none | `{ ok: true, nonce }` |
| POST `/auth/login` | Login. | none | `{ address, signature }` | `{ ok: true, token }` |
| GET `/auth/me` | Current user. | none | none | `{ ok: true, user }` |

### block-index-service (PORT=7626)

| Endpoint | Description | Auth | Request schema | Response schema |
| --- | --- | --- | --- | --- |
| GET `/health` | Health check. | none | none | `{ ok: true, service: "block-index-service" }` |
| GET `/blocks` | Block feed. | none | `?chain&limit` | `{ ok: true, blocks: { number, hash, time, txCount }[] }` |

### bridge-service (PORT=7604)

| Endpoint | Description | Auth | Request schema | Response schema |
| --- | --- | --- | --- | --- |
| GET `/health` | Health check. | none | none | `{ ok: true, service: "bridge-service" }` |
| GET `/bridges` | Bridge networks summary. | none | none | `{ ok: true, networks: BridgeNetwork[], signatures: BridgeSignature[] }` |
| POST `/bridges/pause` | Pause bridge. | none | `{ chain }` | `{ ok: true }` |
| POST `/bridges/resume` | Resume bridge. | none | `{ chain }` | `{ ok: true }` |
| GET `/bridges/fees` | Bridge fee config. | none | none | `{ ok: true, fees }` |
| POST `/bridges/fees` | Update fee config. | none | `{ chain, fee }` | `{ ok: true }` |
| GET `/bridges/incidents` | Bridge incidents. | none | none | `{ ok: true, incidents: BridgeIncident[] }` |
| POST `/bridges/incidents` | Create incident. | none | `{ message, severity }` | `{ ok: true, incident }` |

Dependencies: Prometheus (`PROM_URL`).

### chain-status-service (PORT=7612)

| Endpoint | Description | Auth | Request schema | Response schema |
| --- | --- | --- | --- | --- |
| GET `/health` | Health check. | none | none | `{ ok: true, service: "chain-status-service" }` |
| GET `/chains` | Chain snapshots for L2/L3. | none | none | `{ ok: true, chains: { l2, l3 } }` |

Dependencies: RPC endpoints (`RPC_L2`, `RPC_L3`).

### command-palette-service (PORT=7642)

| Endpoint | Description | Auth | Request schema | Response schema |
| --- | --- | --- | --- | --- |
| GET `/health` | Health check. | none | none | `{ ok: true, service: "command-palette-service" }` |
| GET `/commands` | Command palette items. | none | none | `{ ok: true, commands: { id, label, href }[] }` |

### compliance-export-service (PORT=7621)

| Endpoint | Description | Auth | Request schema | Response schema |
| --- | --- | --- | --- | --- |
| GET `/health` | Health check. | none | none | `{ ok: true, service: "compliance-export-service" }` |
| GET `/exports` | Compliance export list. | none | none | `{ ok: true, exports: { id, type, createdAt }[] }` |

### consensus-telemetry-service (PORT=7635)

| Endpoint | Description | Auth | Request schema | Response schema |
| --- | --- | --- | --- | --- |
| GET `/health` | Health check. | none | none | `{ ok: true, service: "consensus-telemetry-service" }` |
| GET `/consensus` | Consensus telemetry. | none | none | `{ ok: true, participation, latency }` |

Dependencies: Prometheus (`PROM_URL`).

### contract-registry-service (PORT=7608)

| Endpoint | Description | Auth | Request schema | Response schema |
| --- | --- | --- | --- | --- |
| GET `/health` | Health check. | none | none | `{ ok: true, service: "contract-registry-service" }` |
| GET `/contracts` | Contract registry. | none | none | `{ ok: true, contracts: { address, name, verified, proxyType, owner, hasCodeL2, hasCodeL3 }[] }` |

Dependencies: Prometheus (`PROM_URL`), RPC endpoints (`RPC_L2`, `RPC_L3`).

### contract-risk-service (PORT=7609)

| Endpoint | Description | Auth | Request schema | Response schema |
| --- | --- | --- | --- | --- |
| GET `/health` | Health check. | none | none | `{ ok: true, service: "contract-risk-service" }` |
| GET `/risk` | Contract risk scores. | none | `?limit` | `{ ok: true, risks: { address, score, flags }[] }` |

Dependencies: Prometheus (`PROM_URL`).

### dispute-service (PORT=7607)

| Endpoint | Description | Auth | Request schema | Response schema |
| --- | --- | --- | --- | --- |
| GET `/health` | Health check. | none | none | `{ ok: true, service: "dispute-service" }` |
| GET `/disputes` | Dispute list. | none | none | `{ ok: true, disputes: { id, status, reason, createdAt }[] }` |

### entity-tagging-service (PORT=7627)

| Endpoint | Description | Auth | Request schema | Response schema |
| --- | --- | --- | --- | --- |
| GET `/health` | Health check. | none | none | `{ ok: true, service: "entity-tagging-service" }` |
| GET `/tags` | Entity tags. | none | `?entity` | `{ ok: true, tags: { entity, label, risk }[] }` |

### explainability-service (PORT=7632)

| Endpoint | Description | Auth | Request schema | Response schema |
| --- | --- | --- | --- | --- |
| GET `/health` | Health check. | none | none | `{ ok: true, service: "explainability-service" }` |
| GET `/explain` | Explainability text. | none | `?topic` | `{ ok: true, explanation, references }` |

### feature-flags-service (PORT=7611)

| Endpoint | Description | Auth | Request schema | Response schema |
| --- | --- | --- | --- | --- |
| GET `/health` | Health check. | none | none | `{ ok: true, service: "feature-flags-service" }` |
| GET `/flags` | Feature flag list. | none | none | `{ ok: true, flags }` |

### fee-model-service (PORT=7615)

| Endpoint | Description | Auth | Request schema | Response schema |
| --- | --- | --- | --- | --- |
| GET `/health` | Health check. | none | none | `{ ok: true, service: "fee-model-service" }` |
| GET `/fees` | Fee model snapshot. | none | none | `{ ok: true, feeModel }` |

### forecasting-service (PORT=7617)

| Endpoint | Description | Auth | Request schema | Response schema |
| --- | --- | --- | --- | --- |
| GET `/health` | Health check. | none | none | `{ ok: true, service: "forecasting-service" }` |
| GET `/forecast` | Forecasting output. | none | `?horizon` | `{ ok: true, forecast }` |

### ghost-relayer (PORT via env)

| Endpoint | Description | Auth | Request schema | Response schema |
| --- | --- | --- | --- | --- |
| GET `/health` | Health check. | none | none | `{ ok: true }` |
| GET `/logs` | Logs stream. | none | none | `{ ok: true, logs }` |
| GET `/metrics` | Metrics JSON. | none | none | `{ ok: true, metrics }` |
| GET `/metrics/prom` | Prometheus metrics. | none | none | text/plain |

### ghost-rollup-challenger (PORT via env)

| Endpoint | Description | Auth | Request schema | Response schema |
| --- | --- | --- | --- | --- |
| POST `/trigger` | Trigger challenge. | none | `{ reason }` | `{ ok: true }` |
| GET `/health` | Health check. | none | none | `{ ok: true }` |
| GET `/metrics` | Metrics JSON. | none | none | `{ ok: true, metrics }` |
| GET `/metrics/prom` | Prometheus metrics. | none | none | text/plain |

### ghost-rollup-proposer (PORT via env)

| Endpoint | Description | Auth | Request schema | Response schema |
| --- | --- | --- | --- | --- |
| GET `/health` | Health check. | none | none | `{ ok: true }` |
| GET `/metrics` | Metrics JSON. | none | none | `{ ok: true, metrics }` |
| GET `/metrics/prom` | Prometheus metrics. | none | none | text/plain |

### global-search-service (PORT=7637)

| Endpoint | Description | Auth | Request schema | Response schema |
| --- | --- | --- | --- | --- |
| GET `/health` | Health check. | none | none | `{ ok: true, service: "global-search-service" }` |
| GET `/search` | Global search. | none | `?q` | `{ ok: true, results: { id, label, type, href }[] }` |

### governance-service (PORT=7645)

| Endpoint | Description | Auth | Request schema | Response schema |
| --- | --- | --- | --- | --- |
| GET `/health` | Health check. | none | none | `{ ok: true, service: "governance-service" }` |
| GET `/proposals` | Proposal list. | none | none | `{ ok: true, proposals }` |
| GET `/delegations` | Delegation list. | none | none | `{ ok: true, delegations }` |

### key-rotation-service (PORT=7619)

| Endpoint | Description | Auth | Request schema | Response schema |
| --- | --- | --- | --- | --- |
| GET `/health` | Health check. | none | none | `{ ok: true, service: "key-rotation-service" }` |
| GET `/keys` | Key rotation status. | none | none | `{ ok: true, keys }` |

### liquidity-service (PORT=7606)

| Endpoint | Description | Auth | Request schema | Response schema |
| --- | --- | --- | --- | --- |
| GET `/health` | Health check. | none | none | `{ ok: true, service: "liquidity-service" }` |
| GET `/liquidity` | Liquidity pools. | none | none | `{ ok: true, pools }` |

### mempool-service (PORT=7610)

| Endpoint | Description | Auth | Request schema | Response schema |
| --- | --- | --- | --- | --- |
| GET `/health` | Health check. | none | none | `{ ok: true, service: "mempool-service" }` |
| GET `/mempool` | Mempool snapshot. | none | `?chain` | `{ ok: true, mempool }` |

### network-context-service (PORT=7633)

| Endpoint | Description | Auth | Request schema | Response schema |
| --- | --- | --- | --- | --- |
| GET `/health` | Health check. | none | none | `{ ok: true, service: "network-context-service" }` |
| GET `/context` | Network context. | none | none | `{ ok: true, context }` |

### network-manager-service (PORT via env)

| Endpoint | Description | Auth | Request schema | Response schema |
| --- | --- | --- | --- | --- |
| GET `/health` | Health check. | none | none | `{ ok: true }` |
| GET `/status` | Network status. | none | none | `{ ok: true, status }` |
| GET `/policy` | Action policy. | none | none | `{ ok: true, policy }` |
| POST `/policy` | Update action policy. | `x-execution-token` | `ActionPolicy` | `{ ok: true, policy }` |
| POST `/remediate/dry-run` | Remediation dry run. | none | `{ actions }` | `{ ok: true, plan }` |
| POST `/remediate/execute` | Execute approved plan. | `x-execution-token` | `{ plan }` | `{ ok: true, results, evidencePath }` |

### node-health-service (PORT=7613)

| Endpoint | Description | Auth | Request schema | Response schema |
| --- | --- | --- | --- | --- |
| GET `/health` | Health check. | none | none | `{ ok: true, service: "node-health-service" }` |
| GET `/nodes` | Node health list. | none | none | `{ ok: true, nodes }` |

### node-inventory-service (PORT=7622)

| Endpoint | Description | Auth | Request schema | Response schema |
| --- | --- | --- | --- | --- |
| GET `/health` | Health check. | none | none | `{ ok: true, service: "node-inventory-service" }` |
| GET `/nodes` | Node inventory list. | none | none | `{ ok: true, nodes }` |

### notifications-service (PORT=7638)

| Endpoint | Description | Auth | Request schema | Response schema |
| --- | --- | --- | --- | --- |
| GET `/health` | Health check. | none | none | `{ ok: true, service: "notifications-service" }` |
| GET `/notifications` | Notification list. | none | none | `{ ok: true, notifications }` |

### participation-service (PORT=7603)

| Endpoint | Description | Auth | Request schema | Response schema |
| --- | --- | --- | --- | --- |
| GET `/health` | Health check. | none | none | `{ ok: true, service: "participation-service" }` |
| GET `/participation` | Participation metrics. | none | none | `{ ok: true, participation }` |

### payout-service (PORT=7629)

| Endpoint | Description | Auth | Request schema | Response schema |
| --- | --- | --- | --- | --- |
| GET `/health` | Health check. | none | none | `{ ok: true, service: "payout-service" }` |
| GET `/payouts` | Payout history. | none | none | `{ ok: true, payouts }` |

### peer-graph-service (PORT=7636)

| Endpoint | Description | Auth | Request schema | Response schema |
| --- | --- | --- | --- | --- |
| GET `/health` | Health check. | none | none | `{ ok: true, service: "peer-graph-service" }` |
| GET `/peers` | Peer topology. | none | none | `{ ok: true, peers, topology }` |

### proxy-inspector-service (PORT=7631)

| Endpoint | Description | Auth | Request schema | Response schema |
| --- | --- | --- | --- | --- |
| GET `/health` | Health check. | none | none | `{ ok: true, service: "proxy-inspector-service" }` |
| GET `/proxies` | Proxy inventory. | none | none | `{ ok: true, proxies }` |

### rbac-service (PORT=7640)

| Endpoint | Description | Auth | Request schema | Response schema |
| --- | --- | --- | --- | --- |
| GET `/health` | Health check. | none | none | `{ ok: true, service: "rbac-service" }` |
| GET `/roles` | RBAC roles. | none | none | `{ ok: true, roles }` |
| GET `/permissions` | Permission list. | none | none | `{ ok: true, permissions }` |

### rewards-service (PORT=7602)

| Endpoint | Description | Auth | Request schema | Response schema |
| --- | --- | --- | --- | --- |
| GET `/health` | Health check. | none | none | `{ ok: true, service: "rewards-service" }` |
| GET `/rewards` | Reward summary. | none | none | `{ ok: true, rewards }` |

### ghost-registry (PORT=8088)

| Endpoint | Description | Auth | Request schema | Response schema |
| --- | --- | --- | --- | --- |
| GET `/v1/endpoints` | RPC registry snapshot. | none | none | `{ updatedAt, endpoints: { chainId, rpc, status }[] }` |
| GET `/health` | Health check. | none | none | `{ ok: true }` |

### secrets-health-service (PORT=7618)

| Endpoint | Description | Auth | Request schema | Response schema |
| --- | --- | --- | --- | --- |
| GET `/health` | Health check. | none | none | `{ ok: true, service: "secrets-health-service" }` |
| GET `/secrets` | Secret store status. | none | none | `{ ok: true, secrets }` |

### session-service (PORT=7643)

| Endpoint | Description | Auth | Request schema | Response schema |
| --- | --- | --- | --- | --- |
| GET `/health` | Health check. | none | none | `{ ok: true, service: "session-service" }` |
| POST `/sessions` | Create session. | none | `{ userId, metadata }` | `{ ok: true, session }` |
| GET `/sessions` | List sessions. | none | `?userId` | `{ ok: true, sessions }` |

### slashing-detection-service (PORT=7620)

| Endpoint | Description | Auth | Request schema | Response schema |
| --- | --- | --- | --- | --- |
| GET `/health` | Health check. | none | none | `{ ok: true, service: "slashing-detection-service" }` |
| GET `/slashes` | Slash events. | none | none | `{ ok: true, slashes }` |

### snapshot-service (PORT=7624)

| Endpoint | Description | Auth | Request schema | Response schema |
| --- | --- | --- | --- | --- |
| GET `/health` | Health check. | none | none | `{ ok: true, service: "snapshot-service" }` |
| GET `/snapshots` | Snapshot list. | none | none | `{ ok: true, snapshots }` |

### staking-service (PORT=7601)

| Endpoint | Description | Auth | Request schema | Response schema |
| --- | --- | --- | --- | --- |
| GET `/health` | Health check. | none | none | `{ ok: true, service: "staking-service" }` |
| GET `/stake` | Stake view. | none | none | `{ ok: true, stake }` |

### supply-service (PORT=7614)

| Endpoint | Description | Auth | Request schema | Response schema |
| --- | --- | --- | --- | --- |
| GET `/health` | Health check. | none | none | `{ ok: true, service: "supply-service" }` |
| GET `/supply` | Supply metrics. | none | none | `{ ok: true, supply }` |

### theme-service (PORT=7634)

| Endpoint | Description | Auth | Request schema | Response schema |
| --- | --- | --- | --- | --- |
| GET `/health` | Health check. | none | none | `{ ok: true, service: "theme-service" }` |
| GET `/theme` | Theme config. | none | none | `{ ok: true, theme }` |

### transfer-lifecycle-service (PORT=7605)

| Endpoint | Description | Auth | Request schema | Response schema |
| --- | --- | --- | --- | --- |
| GET `/health` | Health check. | none | none | `{ ok: true, service: "transfer-lifecycle-service" }` |
| GET `/transfers` | Transfer lifecycle list. | none | none | `{ ok: true, transfers }` |

### treasury-service (PORT=7628)

| Endpoint | Description | Auth | Request schema | Response schema |
| --- | --- | --- | --- | --- |
| GET `/health` | Health check. | none | none | `{ ok: true, service: "treasury-service" }` |
| GET `/treasury` | Treasury balances. | none | none | `{ ok: true, balances }` |
| POST `/treasury/withdraw` | Treasury withdrawal. | none | `{ to, amount }` | `{ ok: true, tx }` |

### tx-index-service (PORT=7625)

| Endpoint | Description | Auth | Request schema | Response schema |
| --- | --- | --- | --- | --- |
| GET `/health` | Health check. | none | none | `{ ok: true, service: "tx-index-service" }` |
| GET `/txs` | Tx feed. | none | `?chain&limit` | `{ ok: true, txs }` |

### upgrade-orchestrator-service (PORT=7623)

| Endpoint | Description | Auth | Request schema | Response schema |
| --- | --- | --- | --- | --- |
| GET `/health` | Health check. | none | none | `{ ok: true, service: "upgrade-orchestrator-service" }` |
| GET `/upgrades` | Upgrade jobs list. | none | none | `{ ok: true, upgrades }` |

### validator-service (PORT=7600)

| Endpoint | Description | Auth | Request schema | Response schema |
| --- | --- | --- | --- | --- |
| GET `/health` | Health check. | none | none | `{ ok: true, service: "validator-service" }` |
| GET `/validators` | Validator list. | none | none | `{ ok: true, validators }` |

### verification-service (PORT=7630)

| Endpoint | Description | Auth | Request schema | Response schema |
| --- | --- | --- | --- | --- |
| GET `/health` | Health check. | none | none | `{ ok: true, service: "verification-service" }` |
| GET `/verifications` | Verification records. | none | none | `{ ok: true, verifications }` |

### ai-monitor (PORT via env)

| Endpoint | Description | Auth | Request schema | Response schema |
| --- | --- | --- | --- | --- |
| GET `/health` | Health check. | none | none | `{ ok: true }` |
| GET `/metrics` | AI monitor metrics. | none | none | Prometheus-style metrics |

### ai-clock-sync (PORT=7690)

| Endpoint | Description | Auth | Request schema | Response schema |
| --- | --- | --- | --- | --- |
| GET `/` (or `/health`) | Status + drift snapshot for all chains. | none | none | `{ status, thresholdSeconds, state }` |
| GET `/metrics` | Clock sync metrics (Prometheus). | none | none | Prometheus-style metrics |
| POST `/l1` | JSON-RPC proxy to L1. | `Authorization: Bearer $CLOCK_SYNC_PROXY_TOKEN` or `X-Clock-Sync-Token` if token set | JSON-RPC | JSON-RPC response |
| POST `/l2` | JSON-RPC proxy to L2. | `Authorization: Bearer $CLOCK_SYNC_PROXY_TOKEN` or `X-Clock-Sync-Token` if token set | JSON-RPC | JSON-RPC response |
| POST `/l3` | JSON-RPC proxy to L3. | `Authorization: Bearer $CLOCK_SYNC_PROXY_TOKEN` or `X-Clock-Sync-Token` if token set | JSON-RPC | JSON-RPC response |

## Missing endpoints for UI requirements

All UI console pages are wired only to existing endpoints listed above; no additional endpoints were required.

## Non-HTTP services (no Express routes in `services/*/src`)\n\n- `services/ghost-guard` (no HTTP entrypoint)\n- `services/ghost-rpc-proxy` (no HTTP entrypoint)
