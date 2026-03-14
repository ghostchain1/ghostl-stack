// GhostBrain Strategic Intelligence System — strategy targets
// All thresholds are configurable via environment variables.
// Defaults reflect conservative operating targets for GhostChain.

export const TARGETS = {
  // Forecasting thresholds (percent)
  validatorLoad:     Number(process.env.SIS_VALIDATOR_LOAD_TARGET   ?? '70'),   // % above = high risk
  gasTarget:         Number(process.env.SIS_GAS_TARGET              ?? '40'),   // baseline Gwei
  liquidityBuffer:   Number(process.env.SIS_LIQUIDITY_BUFFER        ?? '20'),   // % of treasury to keep liquid

  // Economics
  maxInflationRate:  Number(process.env.SIS_MAX_INFLATION_PCT        ?? '5'),    // % annual
  minBurnRate:       Number(process.env.SIS_MIN_BURN_RATE            ?? '1.5'),  // % annual
  targetStakingAPR:  Number(process.env.SIS_TARGET_STAKING_APR      ?? '12'),   // %

  // Scaling
  chainLoadCritical: Number(process.env.SIS_CHAIN_LOAD_CRITICAL     ?? '85'),   // % triggers L3 expansion
  chainLoadHigh:     Number(process.env.SIS_CHAIN_LOAD_HIGH         ?? '70'),   // % triggers planning

  // Bridge
  maxBridgeLatencyMs:Number(process.env.SIS_MAX_BRIDGE_LATENCY_MS   ?? '5000'), // ms
  maxBridgeCongestion:Number(process.env.SIS_MAX_BRIDGE_CONGESTION  ?? '75'),   // %

  // Liquidity routing (cross-chain split targets)
  l1TargetPct:       Number(process.env.SIS_L1_TARGET_PCT           ?? '50'),   // % on L1
  l2TargetPct:       Number(process.env.SIS_L2_TARGET_PCT           ?? '30'),   // % on L2
  l3TargetPct:       Number(process.env.SIS_L3_TARGET_PCT           ?? '20'),   // % on L3

  // Governance
  maxProposalsPerDay:Number(process.env.SIS_MAX_PROPOSALS_PER_DAY   ?? '10'),
} as const;

// Canonical chain identifiers — used in proposals and log labels
export const CHAIN = {
  L1:      { id: 14000101, rpc: process.env.L1_RPC_URL ?? 'http://localhost:18545', label: 'GhostChain L1' },
  L2:      { id: 901,      rpc: process.env.L2_RPC_URL ?? 'http://localhost:29545', label: 'GhostL2'       },
  L3:      { id: 903,      rpc: process.env.L3_RPC_URL ?? 'http://localhost:39545', label: 'GhostL3'       },
} as const;

export const SIGNING_RELAY_URL  = process.env.SIGNING_RELAY_URL   ?? 'http://localhost:7910';
export const GHOSTSTACK_API_BASE = process.env.GHOSTSTACK_API_BASE ?? 'http://localhost:3000';
export const GHOSTBRAIN_URL     = process.env.GHOSTBRAIN_URL      ?? 'http://localhost:7900';
export const DRY_RUN            = process.env.SIS_DRY_RUN         === '1';
export const CYCLE_INTERVAL_MS  = Number(process.env.SIS_CYCLE_INTERVAL_MS ?? '120000');
export const SIS_PORT           = Number(process.env.SIS_PORT               ?? '7925');
