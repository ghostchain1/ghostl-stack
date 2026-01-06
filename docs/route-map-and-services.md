# Route Map & Service Interfaces

High-level page areas and where their service interfaces live in the repo.

## App shell
- Pages/components: layout, nav, search, command palette (apps/web/src/modules/app-shell/components/*)
- Providers/services: feature flags, network context, theme (apps/web/src/modules/app-shell/services/*.ts)

## Identity & access
- Pages: Login, Users & Roles, API Keys, Sessions
- Services: AuthService, RBACService, AuditLogService, ApiKeyService, UserService (apps/api/src/modules/identity-access/services.ts)
- RBAC groups: Viewer, Operator, Security Admin, Treasury Admin, Protocol Admin, Developer (apps/web/src/modules/identity-access/README.md)

## Security & compliance
- Pages: Security overview, Validator keys, Vault/HSM, Slashing risk, Attack surface, Compliance
- Services: secrets health, key rotation, slashing detection, compliance export (apps/web/src/modules/security/services.ts)

## Chain & consensus
- Pages: Chain overview, Fork/reorg monitor, Peer topology, Config viewer
- Services: ChainStatusService, ConsensusTelemetryService, PeerGraphService (apps/web/src/modules/chain/services.ts)

## Nodes / ops
- Pages: Nodes list/detail, Upgrades & version drift, Snapshots/pruning
- Services: NodeInventoryService, NodeHealthService, UpgradeOrchestratorService, SnapshotService (apps/web/src/modules/nodes/services.ts)

## Validators / staking
- Pages: Validators, Validator detail, Voting power, Finality/participation
- Services: ValidatorService, StakingService, RewardsService, ParticipationService (apps/web/src/modules/validators/services.ts)

## Explorer (operational)
- Pages: Mempool, Transactions, Blocks, Entity view
- Services: MempoolService, TxIndexService, BlockIndexService, EntityTaggingService (apps/web/src/modules/explorer/services.ts)

## Tokenomics & treasury
- Pages: Supply, Fee market, Treasury, Payouts, Revenue
- Services: SupplyService, FeeModelService, TreasuryService, PayoutService (apps/web/src/modules/tokenomics/services.ts)

## Contracts
- Pages: Registry, Contract detail, Admin controls, Execution analytics
- Services: ContractRegistryService, VerificationService, ProxyInspectorService, ContractRiskService (apps/web/src/modules/contracts/services.ts)

## Bridges & interop
- Pages: Bridges overview, Transfers, Liquidity, Disputes/fraud proofs, Emergency controls
- Services: BridgeService, TransferLifecycleService, LiquidityService, DisputeService (apps/web/src/modules/bridge/services.ts)

## AI / fraud / forecasting
- Pages: AI security center, Wallet behavior, Sybil detection, Forecasting
- Services: AnomalyDetectionService, FraudScoringService, ForecastingService, ExplainabilityService (apps/web/src/modules/ai/services.ts)

## Observability & alerts
- Pages: Metrics, Dashboards, Logs, Alerts & routing
- Services: MetricsService, LogsService, AlertRulesService, NotificationRouterService (apps/web/src/modules/observability/services.ts)

## DevOps & upgrades
- Pages: Release planner, Hard forks, Feature flags, Upgrade jobs, Rollback history
- Services: ReleaseService, ForkSchedulerService, UpgradeJobService, RollbackService (apps/web/src/modules/devops/services.ts)

## Governance
- Pages: Proposals, Vote tracking/quorum, Execution queue, Delegation
- Services: GovernanceService, VotingAnalyticsService, ExecutionQueueService (apps/web/src/modules/governance/services.ts)

## Integrations
- Pages: RPC endpoint manager, Usage analytics, Webhooks, Partner integrations
- Services: RpcManagerService, RateLimitService, UsageAnalyticsService, WebhookService (apps/web/src/modules/integrations/services.ts)
