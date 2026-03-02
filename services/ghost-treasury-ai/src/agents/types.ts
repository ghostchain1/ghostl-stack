/**
 * agents/types.ts — Shared type definitions for the GhostTreasuryAI agent swarm.
 */

// ─── On-chain layer enum (mirrors Solidity TreasuryGovernor.OperationLayer) ─────

export const OperationLayer = {
  L1: 0,
  L2: 1,
  L3: 2,
} as const;
export type OperationLayer = (typeof OperationLayer)[keyof typeof OperationLayer];

// ─── Agent verdict ────────────────────────────────────────────────────────────

export type Verdict = 'approve' | 'reject' | 'abstain';

export interface AgentVote {
  agentId:    string;
  verdict:    Verdict;
  confidence: number;         // 0–1
  rationale:  string;
  evidence?:  Record<string, unknown>;
}

// ─── Market snapshot (read from L1 + oracles) ─────────────────────────────────

export interface MarketSnapshot {
  timestamp:            number;          // unix ms
  navEth:               bigint;
  stableReserveEth:     bigint;
  dailyVaREth:          bigint;
  weeklyLossEth:        bigint;
  circuitBreakerOpen:   boolean;
  strategyCount:        number;
  sequencerFeeRateGwei: number;          // L2 sequencer fee proxy
  // Add more market fields as oracle feeds are integrated
}

// ─── Proposal intent (AI-generated, not yet on-chain) ────────────────────────

export interface ProposalIntent {
  id:               string;             // uuid (off-chain)
  originatorHash:   string;            // keccak of agent collective + snapshot
  strategyId:       number;
  token:            string;            // ERC-20 address or '0x0' for native
  target:           string;            // strategy contract
  amountEth:        bigint;
  callData:         string;            // hex
  layer:            OperationLayer;
  estNAVAfterEth:   bigint;
  estStableAfterEth:bigint;
  estAssetAlloc:    bigint;
  rationale:        string;
  votes:            AgentVote[];
  shadowOnly:       boolean;
}

// ─── Agent context (passed to each agent per cycle) ───────────────────────────

export interface AgentContext {
  snapshot:     MarketSnapshot;
  autonomyTier: number;
  shadowMode:   boolean;
  cycleId:      string;
}
