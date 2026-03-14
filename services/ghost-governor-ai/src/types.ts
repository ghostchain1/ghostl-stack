/**
 * Shared types for ghost-governor-ai.
 * All monetary values are in GST wei (1 GST = 1e18 wei) unless noted.
 */

export type RiskLevel = "low" | "medium" | "high" | "critical";

// ---------------------------------------------------------------------------
// Chain metrics
// ---------------------------------------------------------------------------

export interface ChainMetrics {
  chainId: number;
  rpc: string;
  gasPrice: bigint;       // wei per gas unit
  blockNumber: bigint;
  blockTime: number;      // estimated seconds per block
  txRatePerMin: number;
  reachable: boolean;
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

export interface ValidatorInfo {
  address: string;        // bech32 (L1 Cosmos) or 0x hex (L2/L3 EVM)
  moniker: string;
  uptime: number;         // 0–100 %
  signedBlocks: number;
  missedBlocks: number;
  performance: number;    // composite score 0–100
  delegatedStake: bigint; // GST wei
  commissionBps: number;  // basis points (100 = 1 %)
  jailed: boolean;
  slashedRecently: boolean;
}

// ---------------------------------------------------------------------------
// Liquidity / DeFi
// ---------------------------------------------------------------------------

export interface PoolHealth {
  address: string;
  token0Symbol: string;
  token1Symbol: string;
  gstReserve: bigint;
  otherReserve: bigint;
  gstReservePct: number;  // 0–100 %
  tvl: bigint;            // denominated in GST wei
}

export interface LiquidityState {
  totalTVL: bigint;
  l2GstReserve: bigint;
  l2GstReservePct: number;
  low: boolean;           // below MIN_GST_RESERVE_PCT
  high: boolean;          // single-pool concentration above MAX_TVL_CONCENTRATION
  pools: PoolHealth[];
}

export interface DefiState {
  totalFeeRevenue24h: bigint;
  avgPoolUtilisation: number; // 0–100 %
  bridgeVolume24h: bigint;
  anomalousDrain: boolean;
  txSpike: number;            // ratio: current tx rate / 24 h rolling average
}

// ---------------------------------------------------------------------------
// Treasury
// ---------------------------------------------------------------------------

export interface TreasuryState {
  balanceL1: bigint;          // current treasury GST balance on L1
  monthlyRevenue: bigint;     // rolling 30-day revenue
  monthlyBurn: bigint;        // rolling 30-day GST burn
  buybackPending: boolean;
  nextBuybackThreshold: bigint;
}

// ---------------------------------------------------------------------------
// Full network snapshot
// ---------------------------------------------------------------------------

export interface NetworkState {
  timestamp: number;
  l1: ChainMetrics;
  l2: ChainMetrics;
  l3: ChainMetrics;
  validators: ValidatorInfo[];
  liquidity: LiquidityState;
  treasury: TreasuryState;
  defi: DefiState;
}

// ---------------------------------------------------------------------------
// Governance proposals
// ---------------------------------------------------------------------------

export type ProposalType =
  | "fee_adjustment"
  | "liquidity_inject"
  | "liquidity_withdraw"
  | "validator_penalize"
  | "validator_reward"
  | "treasury_invest"
  | "treasury_buyback"
  | "emergency_pause"
  | "governance_execute";

export interface GovernorProposal {
  id: string;
  type: ProposalType;
  description: string;
  params: Record<string, unknown>;
  timestamp: number;
  risk: RiskLevel;
  /** Always true — human ratification required before any on-chain execution. */
  requiresRatification: boolean;
  /**
   * Only true for emergency_pause when ALLOW_EMERGENCY_EXEC=true.
   * Never true for treasury, validator, or governance actions.
   */
  autoExecute: boolean;
}

// ---------------------------------------------------------------------------
// Governor cycle & status
// ---------------------------------------------------------------------------

export interface GovernorCycle {
  cycleId: string;
  startTime: number;
  endTime?: number;
  proposals: GovernorProposal[];
  errors: string[];
  status: "running" | "completed" | "failed";
}

export interface GovernorStatus {
  running: boolean;
  cycleCount: number;
  lastCycle?: GovernorCycle;
  totalProposals: number;
  dryRun: boolean;
  uptimeSeconds: number;
}
