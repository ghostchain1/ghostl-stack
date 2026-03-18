// GhostBrain APE — evolution rules and environment configuration

export interface EvolutionConfig {
  /** Block time threshold — above this triggers an improvement scan (ms) */
  maxBlockTimeMs: number;
  /** Gas utilisation target — above this triggers gas optimisation (%) */
  targetGasUsagePct: number;
  /** Max load delta between any two validators before rebalancing is proposed (%) */
  validatorBalanceThresholdPct: number;
  /** Minimum simulation success rate before a proposal is generated (%) */
  simulationMinSuccessPct: number;
  /** How often the evolution cycle runs (ms) */
  cycleIntervalMs: number;
  /** Guard rail: max proposals that may be submitted in a 24-hour window */
  maxProposalsPerDay: number;
  /** GhostBrain Core base URL */
  ghostbrainUrl: string;
  /** GhostChain L1 JSON-RPC */
  l1RpcUrl: string;
  /** GhostL2 JSON-RPC */
  l2RpcUrl: string;
  /** GhostL3 JSON-RPC */
  l3RpcUrl: string;
  /** Signing relay — all proposals are routed here for human ratification */
  signingRelayUrl: string;
  /** HTTP status API port */
  statusPort: number;
}

export const RULES: EvolutionConfig = {
  maxBlockTimeMs:               Number(process.env.APE_MAX_BLOCK_TIME_MS        ?? 3_000),
  targetGasUsagePct:            Number(process.env.APE_TARGET_GAS_PCT           ?? 60),
  validatorBalanceThresholdPct: Number(process.env.APE_VALIDATOR_THRESHOLD_PCT  ?? 20),
  simulationMinSuccessPct:      Number(process.env.APE_SIM_MIN_SUCCESS_PCT      ?? 85),
  cycleIntervalMs:              Number(process.env.APE_CYCLE_INTERVAL_MS        ?? 60_000),
  maxProposalsPerDay:           Number(process.env.APE_MAX_PROPOSALS_DAY        ?? 5),
  ghostbrainUrl:  process.env.GHOSTBRAIN_URL       ?? 'http://localhost:7900',
  l1RpcUrl:       process.env.L1_RPC_URL           ?? 'http://localhost:18545',
  l2RpcUrl:       process.env.L2_RPC_URL           ?? 'http://localhost:29547',
  l3RpcUrl:       process.env.L3_RPC_URL           ?? 'http://localhost:39545',
  signingRelayUrl: process.env.SIGNING_RELAY_URL   ?? 'http://localhost:7910',
  statusPort:     Number(process.env.APE_STATUS_PORT ?? 7924),
};
