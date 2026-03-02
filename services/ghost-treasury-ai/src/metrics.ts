/**
 * metrics.ts — Prometheus metrics for GhostTreasuryAI.
 *
 * Exposed at GET /metrics (prom-client default registry).
 */

import { Registry, Counter, Gauge, Histogram } from 'prom-client';

export const registry = new Registry();
registry.setDefaultLabels({ service: 'ghost-treasury-ai' });

// ─── Proposal lifecycle ───────────────────────────────────────────────────────

export const proposalsTotal = new Counter({
  name:    'treasury_ai_proposals_total',
  help:    'Total proposals submitted by the AI swarm',
  labelNames: ['status', 'strategy_id', 'layer'],
  registers: [registry],
});

export const proposalsExecuted = new Counter({
  name:    'treasury_ai_proposals_executed_total',
  help:    'Proposals successfully executed on-chain',
  labelNames: ['strategy_id'],
  registers: [registry],
});

export const proposalsCancelled = new Counter({
  name:    'treasury_ai_proposals_cancelled_total',
  help:    'Proposals cancelled before execution',
  labelNames: ['reason'],
  registers: [registry],
});

// ─── Risk engine ──────────────────────────────────────────────────────────────

export const circuitBreakerState = new Gauge({
  name:    'treasury_ai_circuit_breaker_open',
  help:    '1 if circuit-breaker is open, 0 otherwise',
  registers: [registry],
});

export const dailyVaR = new Gauge({
  name:    'treasury_ai_daily_var_eth',
  help:    'Current daily Value-at-Risk accumulation in ETH',
  registers: [registry],
});

export const weeklyLoss = new Gauge({
  name:    'treasury_ai_weekly_loss_eth',
  help:    'Rolling 7-day realised loss in ETH',
  registers: [registry],
});

// ─── Treasury health ──────────────────────────────────────────────────────────

export const treasuryNAV = new Gauge({
  name:    'treasury_ai_nav_eth',
  help:    'Last known treasury NAV in ETH equivalent',
  registers: [registry],
});

export const stableReserve = new Gauge({
  name:    'treasury_ai_stable_reserve_eth',
  help:    'Estimated stable reserve in ETH',
  registers: [registry],
});

export const runwayCoverage = new Gauge({
  name:    'treasury_ai_runway_coverage_months',
  help:    'Estimated ops runway in months at current burn rate',
  registers: [registry],
});

export const totalRevenueRouted = new Gauge({
  name:    'treasury_ai_revenue_routed_eth_total',
  help:    'Cumulative protocol revenue routed to L1 buckets in ETH',
  labelNames: ['bucket'],
  registers: [registry],
});

// ─── Agent swarm ──────────────────────────────────────────────────────────────

export const agentCycles = new Counter({
  name:    'treasury_ai_agent_cycles_total',
  help:    'Total reasoning cycles completed per agent',
  labelNames: ['agent'],
  registers: [registry],
});

export const agentVotes = new Counter({
  name:    'treasury_ai_agent_votes_total',
  help:    'Total votes cast per agent and verdict',
  labelNames: ['agent', 'verdict'],
  registers: [registry],
});

export const agentLatency = new Histogram({
  name:    'treasury_ai_agent_latency_ms',
  help:    'Agent reasoning latency in milliseconds',
  labelNames: ['agent'],
  buckets:    [10, 50, 100, 250, 500, 1000, 2500, 5000],
  registers:  [registry],
});

// ─── Solvency proof ───────────────────────────────────────────────────────────

export const solvencySnapshots = new Counter({
  name:    'treasury_ai_solvency_snapshots_total',
  help:    'Solvency snapshots published to ProofOfSolvency',
  registers: [registry],
});

export const lastSnapshotTimestamp = new Gauge({
  name:    'treasury_ai_last_solvency_snapshot_timestamp',
  help:    'Unix timestamp of the most recent solvency snapshot',
  registers: [registry],
});

// ─── Shadow mode ──────────────────────────────────────────────────────────────

export const shadowProposals = new Counter({
  name:    'treasury_ai_shadow_proposals_total',
  help:    'Proposals generated in shadow mode (not submitted on-chain)',
  registers: [registry],
});

export const autonomyTier = new Gauge({
  name:    'treasury_ai_autonomy_tier',
  help:    'Current autonomy tier (0-5)',
  registers: [registry],
});
