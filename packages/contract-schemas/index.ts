import { z } from 'zod';

export const ApiErrorSchema = z.object({
  error: z.string(),
  service: z.string().optional(),
  hint: z.string().optional()
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const ChainInfoSchema = z.object({
  chainId: z.string().optional(),
  name: z.string().optional(),
  env: z.string().optional(),
  consensus: z.string().optional()
});
export const EpochInfoSchema = z.object({
  epoch: z.number(),
  round: z.number(),
  start: z.string(),
  end: z.string()
});
export const ReorgEventSchema = z.object({
  depth: z.number(),
  fromBlock: z.number(),
  toBlock: z.number(),
  time: z.string()
});
export const ChainTelemetrySchema = z.object({
  participation: z.number(),
  latency: z.object({ p50: z.number() }),
  health: z.object({
    timestamp: z.number(),
    services: z.array(
      z.object({
        job: z.string(),
        instance: z.string().optional(),
        up: z.boolean()
      })
    ),
    guard: z.object({
      deposits: z.number(),
      alerts: z.number(),
      allowDecisions: z.number()
    }),
    relayer: z.object({
      finalized: z.number(),
      errors: z.number()
    }),
    chain: z.object({
      head: z.number(),
      finalized: z.number()
    })
  })
});
export const PeerSchema = z.object({
  id: z.string(),
  address: z.string(),
  latencyMs: z.number().optional()
});
export const ChainPeersSchema = z.object({
  peers: z.array(PeerSchema),
  topology: z.object({ generatedAt: z.number() }).passthrough()
});
export const ChainRpcSnapshotSchema = z.object({
  url: z.string().optional(),
  chainId: z.number().optional(),
  blockNumber: z.number().optional(),
  gasPriceGwei: z.number().optional(),
  peers: z.number().optional(),
  status: z.enum(['ok', 'error']),
  error: z.string().optional()
});
export const ChainSnapshotSchema = z.object({
  id: z.enum(['l1', 'l2', 'l3']),
  label: z.string(),
  info: ChainInfoSchema.optional(),
  blockTimeMs: z.number().optional(),
  finalityLag: z.number().optional(),
  reorgs: z.array(ReorgEventSchema).optional(),
  telemetry: ChainTelemetrySchema.optional(),
  peers: ChainPeersSchema.optional(),
  rpc: ChainRpcSnapshotSchema,
  errors: z.array(z.string()).optional()
});
export const ChainOverviewSchema = z.object({
  chains: z.array(ChainSnapshotSchema)
});
export type ChainOverview = z.infer<typeof ChainOverviewSchema>;

export const NodeSchema = z.object({
  id: z.string(),
  type: z.enum(['validator', 'full', 'archive', 'rpc']),
  host: z.string(),
  version: z.string(),
  status: z.enum(['online', 'offline', 'syncing', 'degraded']),
  lastSeenAt: z.string().optional()
});
export const NodeMetricsSchema = z.object({
  cpu: z.number(),
  mem: z.number(),
  disk: z.number(),
  iops: z.number().optional(),
  peers: z.number(),
  lag: z.number().optional(),
  version: z.string().optional(),
  expectedVersion: z.string().optional(),
  versionDrift: z.boolean().optional()
});
export const NodesResponseSchema = z.object({
  nodes: z.array(NodeSchema)
});
export type NodesResponse = z.infer<typeof NodesResponseSchema>;

export const ValidatorSchema = z.object({
  id: z.string(),
  address: z.string(),
  status: z.enum(['active', 'jailed', 'slashed', 'inactive']),
  stake: z.string(),
  commission: z.number(),
  power: z.number()
});
export const ValidatorsResponseSchema = z.object({
  validators: z.array(ValidatorSchema)
});
export type ValidatorsResponse = z.infer<typeof ValidatorsResponseSchema>;

export const TransferSchema = z.object({
  id: z.string(),
  srcChain: z.string(),
  dstChain: z.string(),
  status: z.enum(['pending', 'finalized', 'failed']),
  amount: z.string(),
  txs: z.array(
    z.object({
      hash: z.string(),
      chainId: z.string()
    })
  ),
  createdAt: z.string().optional(),
  signatures: z.array(z.string()).optional(),
  requiredSignatures: z.number().optional()
});
export const BridgeNetworkSchema = z.object({
  id: z.string().optional(),
  pause: z.string().optional(),
  pending: z.string().optional(),
  liquidity: z.string().optional(),
  fees: z.string().optional()
});
export const BridgeSignatureSchema = z.object({
  transferId: z.string().optional(),
  signatures: z.array(z.string()).optional(),
  required: z.number().optional()
});
export const BridgeSummarySchema = z.object({
  bridges: z.array(BridgeNetworkSchema),
  pools: z.array(BridgeNetworkSchema),
  transfers: z.array(TransferSchema),
  signatures: z.array(BridgeSignatureSchema)
});
export type BridgeSummary = z.infer<typeof BridgeSummarySchema>;

export const WalletPolicySchema = z.object({
  dailyLimit: z.string().optional(),
  weeklyLimit: z.string().optional(),
  allowlist: z.array(z.string()).optional(),
  denylist: z.array(z.string()).optional(),
  approvalsRequired: z.number().int().optional()
});
export const WalletSchema = z.object({
  id: z.string(),
  label: z.string(),
  address: z.string(),
  chainId: z.string(),
  type: z.enum(['watch', 'external', 'custodial']),
  ownerUserId: z.string().optional(),
  status: z.enum(['active', 'pending', 'revoked']).optional(),
  policy: WalletPolicySchema.optional(),
  keyPreview: z.string().optional(),
  keyType: z.enum(['mnemonic', 'privateKey']).optional(),
  derivationPath: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export const WalletsResponseSchema = z.object({
  wallets: z.array(WalletSchema)
});
export type WalletsResponse = z.infer<typeof WalletsResponseSchema>;

export const ExplorerBlockSchema = z.object({
  number: z.number(),
  hash: z.string(),
  proposer: z.string().optional(),
  txCount: z.number(),
  size: z.number().optional(),
  time: z.string()
});
export const ExplorerTxSchema = z.object({
  hash: z.string(),
  from: z.string(),
  to: z.string().optional(),
  value: z.string(),
  gas: z.number(),
  status: z.enum(['pending', 'success', 'failed']),
  error: z.string().optional(),
  nonce: z.number().optional(),
  blockNumber: z.number().optional(),
  time: z.string().optional()
});
export const MempoolStatsSchema = z.object({
  pending: z.number(),
  queued: z.number(),
  fairnessScore: z.number().optional(),
  mevRisk: z.string().optional()
});
export const ExplorerSummarySchema = z.object({
  blocks: z.array(ExplorerBlockSchema),
  txs: z.array(ExplorerTxSchema),
  mempool: MempoolStatsSchema
});
export type ExplorerSummary = z.infer<typeof ExplorerSummarySchema>;

export const ContractSchema = z.object({
  address: z.string(),
  name: z.string().optional(),
  abi: z.unknown().optional(),
  verified: z.boolean(),
  proxyType: z.string().optional(),
  owner: z.string().optional(),
  layer: z.string().optional(),
  chainId: z.number().optional(),
  abiHash: z.string().optional(),
  version: z.string().optional(),
  risk: z.record(z.string(), z.unknown()).optional()
});
export const ContractsResponseSchema = z.object({
  contracts: z.array(ContractSchema),
  meta: z
    .object({
      registryError: z.string().optional(),
      riskError: z.string().optional(),
      registryCount: z.number().optional(),
      localCount: z.number().optional(),
      riskCount: z.number().optional()
    })
    .optional()
});
export type ContractsResponse = z.infer<typeof ContractsResponseSchema>;

export const SupplySnapshotSchema = z.object({
  total: z.string(),
  circulating: z.string(),
  burned: z.string(),
  minted: z.string(),
  time: z.string()
});
export const TreasuryTxSchema = z.object({
  id: z.string(),
  to: z.string(),
  amount: z.string(),
  purpose: z.string(),
  approvals: z.array(z.string()),
  createdAt: z.string().optional()
});
export const TokenomicsSummarySchema = z.object({
  snapshots: z.array(SupplySnapshotSchema),
  feeModel: z
    .object({
      baseFee: z.string().optional(),
      targetGas: z.string().optional(),
      mode: z.string().optional()
    })
    .optional(),
  payouts: z.array(TreasuryTxSchema)
});
export type TokenomicsSummary = z.infer<typeof TokenomicsSummarySchema>;

export const TreasurySummarySchema = z.object({
  balance: z
    .object({
      chain: z.string().optional(),
      native: z.string().optional(),
      token: z.string().optional()
    })
    .optional(),
  proposals: z.array(z.record(z.string(), z.unknown())),
  payouts: z.array(TreasuryTxSchema)
});
export type TreasurySummary = z.infer<typeof TreasurySummarySchema>;

export const GovernanceSummarySchema = z.object({
  proposals: z.array(z.record(z.string(), z.unknown())),
  votes: z.array(z.record(z.string(), z.unknown())),
  queue: z.array(z.record(z.string(), z.unknown())),
  delegations: z.array(z.record(z.string(), z.unknown()))
});
export type GovernanceSummary = z.infer<typeof GovernanceSummarySchema>;

export const ComplianceFindingSchema = z.object({
  id: z.string(),
  area: z.string(),
  severity: z.enum(['low', 'medium', 'high']),
  detail: z.string()
});
export const ComplianceReportSchema = z.object({
  id: z.string(),
  period: z.string(),
  status: z.string(),
  generatedAt: z.string(),
  controls: z.array(z.string()),
  findings: z.array(ComplianceFindingSchema),
  exportedAt: z.string().optional()
});
export const ComplianceSummarySchema = z.object({
  reports: z.array(ComplianceReportSchema)
});
export type ComplianceSummary = z.infer<typeof ComplianceSummarySchema>;

export const IntegrationsSummarySchema = z.object({
  definitions: z.array(z.record(z.string(), z.unknown())),
  instances: z.array(z.record(z.string(), z.unknown()))
});
export type IntegrationsSummary = z.infer<typeof IntegrationsSummarySchema>;

export const DevopsSummarySchema = z.object({
  releases: z.array(z.record(z.string(), z.unknown())),
  forks: z.array(z.record(z.string(), z.unknown())),
  upgrades: z.array(z.record(z.string(), z.unknown()))
});
export type DevopsSummary = z.infer<typeof DevopsSummarySchema>;

export const AiSummarySchema = z.object({
  status: z.enum(['ok', 'degraded']),
  modules: z.array(z.string()),
  lastUpdated: z.string()
});
export type AiSummary = z.infer<typeof AiSummarySchema>;

export const AlertSchema = z.object({
  id: z.string(),
  severity: z.enum(['info', 'warning', 'critical']),
  source: z.string(),
  state: z.enum(['firing', 'resolved']),
  firedAt: z.string(),
  resolvedAt: z.string().optional(),
  labels: z.record(z.string(), z.string()).optional(),
  message: z.string().optional()
});
export const LogEventSchema = z.object({
  source: z.string(),
  level: z.enum(['debug', 'info', 'warn', 'error']),
  message: z.string(),
  time: z.string(),
  labels: z.record(z.string(), z.string()).optional()
});
export const ObservabilitySummarySchema = z.object({
  alerts: z.array(AlertSchema),
  logs: z.array(LogEventSchema),
  dashboards: z.array(z.record(z.string(), z.unknown()))
});
export type ObservabilitySummary = z.infer<typeof ObservabilitySummarySchema>;
