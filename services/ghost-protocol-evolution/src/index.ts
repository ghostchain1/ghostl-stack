// GhostChain Autonomous Protocol Evolution Engine (APE) — main process
//
// Evolution loop (runs every APE_CYCLE_INTERVAL_MS, default 60 s):
//   1. Run all three analyzers concurrently (performance, gas, validator)
//   2. Pick the highest-priority improvement detected
//   3. Simulate the proposed change via GhostBrain simulation API
//   4. Sandbox-test the upgrade (fail-closed if sandbox is unreachable)
//   5. Generate a governance proposal
//   6. Submit to signing relay (:7910) for HUMAN RATIFICATION
//
// ⚠  This service NEVER autonomously deploys protocol changes.
//    All outputs are proposals that require validator governance approval.

import http from 'http';
import { analyzePerformance } from './analysis/performanceAnalyzer.js';
import { analyzeGas } from './analysis/gasAnalyzer.js';
import { analyzeValidators } from './analysis/validatorAnalyzer.js';
import { runSimulation } from './simulation/protocolSimulator.js';
import { testUpgrade } from './simulation/upgradeTester.js';
import { generateProposal } from './governance/proposalGenerator.js';
import { submitProposal } from './governance/proposalSubmitter.js';
import { RULES } from './config/evolutionRules.js';
import type { AnalysisResult, EvolutionProposal } from './types.js';

// ── Engine state (read by the status API) ─────────────────────────────────────

const state = {
  phase: 'idle' as 'idle' | 'analyzing' | 'simulating' | 'proposing' | 'submitting',
  cycleCount: 0,
  improvementsDetected: 0,
  simulationsRun: 0,
  proposalsGenerated: 0,
  proposalsSubmitted: 0,
  proposalsFailed: 0,
  lastCycleAt: null as string | null,
  recentProposals: [] as EvolutionProposal[],
  recentAnalyses: [] as AnalysisResult[],
};

// Daily proposal guard — prevents runaway proposal generation
const _proposalTimestamps: number[] = [];
function canSubmitProposal(): boolean {
  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1_000;
  const recent = _proposalTimestamps.filter(t => t >= dayAgo);
  return recent.length < RULES.maxProposalsPerDay;
}
function recordProposal(): void {
  _proposalTimestamps.push(Date.now());
}

// ── Evolution cycle ───────────────────────────────────────────────────────────

async function runCycle(): Promise<void> {
  state.cycleCount++;
  state.lastCycleAt = new Date().toISOString();
  state.phase = 'analyzing';

  console.info(`\n[APE] cycle #${state.cycleCount} — analyzing...`);

  // 1. Run all analyzers concurrently
  const [perfResult, gasResult, validatorResult] = await Promise.all([
    analyzePerformance().catch((err: unknown) => {
      console.error('[APE] performanceAnalyzer error:', err);
      return null;
    }),
    analyzeGas().catch((err: unknown) => {
      console.error('[APE] gasAnalyzer error:', err);
      return null;
    }),
    analyzeValidators().catch((err: unknown) => {
      console.error('[APE] validatorAnalyzer error:', err);
      return null;
    }),
  ]);

  const analyses = [perfResult, gasResult, validatorResult].filter((r): r is AnalysisResult => r !== null);
  state.recentAnalyses = analyses;

  const improvements = analyses.filter(a => a.improvementDetected);

  if (improvements.length === 0) {
    console.info('[APE] no improvements detected this cycle');
    state.phase = 'idle';
    return;
  }

  state.improvementsDetected += improvements.length;
  console.info(`[APE] ${improvements.length} improvement(s) detected:`, improvements.map(i => i.type));

  // 2. Pick highest-priority: prefer critical types over informational
  const priority: Record<string, number> = {
    gas_optimization: 3,
    block_time_reduction: 2,
    validator_rebalancing: 2,
    throughput_increase: 1,
  };
  const top = improvements.sort((a, b) => (priority[b.type ?? ''] ?? 0) - (priority[a.type ?? ''] ?? 0))[0];

  // 3. Simulate
  state.phase = 'simulating';
  console.info(`[APE] running simulation for: ${top.type}`);
  const sim = await runSimulation(top).catch((err: unknown) => {
    console.error('[APE] simulation error:', err);
    return null;
  });

  if (!sim) { state.phase = 'idle'; return; }
  state.simulationsRun++;

  if (!sim.success) {
    console.info(`[APE] simulation success rate ${sim.successRate.toFixed(1)}% below threshold ${RULES.simulationMinSuccessPct}% — skipping proposal`);
    state.phase = 'idle';
    return;
  }

  // 4. Sandbox test (fail-closed)
  const sandboxPassed = await testUpgrade(sim).catch(() => false);
  if (!sandboxPassed) {
    console.info('[APE] sandbox test did not pass — proposal blocked');
    state.phase = 'idle';
    return;
  }

  // 5. Generate proposal
  state.phase = 'proposing';
  const proposal = generateProposal(sim);
  state.proposalsGenerated++;
  state.recentProposals.unshift(proposal);
  if (state.recentProposals.length > 50) state.recentProposals.pop();

  // 6. Submit — respect daily guard rail
  state.phase = 'submitting';
  if (!canSubmitProposal()) {
    console.warn(`[APE] daily proposal limit (${RULES.maxProposalsPerDay}) reached — not submitting`);
    state.phase = 'idle';
    return;
  }

  const submitted = await submitProposal(proposal).catch((err: unknown) => {
    console.error('[APE] submit error:', err);
    return { ...proposal, status: 'submit_failed' as const };
  });

  if (submitted.status === 'submitted') {
    state.proposalsSubmitted++;
    recordProposal();
  } else {
    state.proposalsFailed++;
  }

  // Update in recent proposals list
  const idx = state.recentProposals.findIndex(p => p.id === proposal.id);
  if (idx >= 0) state.recentProposals[idx] = submitted;

  state.phase = 'idle';
  console.info(`[APE] cycle #${state.cycleCount} complete`);
}

// ── HTTP status API on :7924 ──────────────────────────────────────────────────

function startStatusServer(): void {
  const server = http.createServer((req, res) => {
    if (req.method !== 'GET') { res.writeHead(405).end(); return; }

    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    if (req.url === '/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ...state,
        rules: {
          maxBlockTimeMs: RULES.maxBlockTimeMs,
          targetGasUsagePct: RULES.targetGasUsagePct,
          validatorBalanceThresholdPct: RULES.validatorBalanceThresholdPct,
          cycleIntervalMs: RULES.cycleIntervalMs,
          maxProposalsPerDay: RULES.maxProposalsPerDay,
        },
        ts: new Date().toISOString(),
      }));
      return;
    }

    res.writeHead(404).end();
  });

  server.listen(RULES.statusPort, () => {
    console.info(`[APE] status API listening on :${RULES.statusPort}`);
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.info('[APE] GhostChain Protocol Evolution Engine starting');
  console.info(`[APE] cycle interval: ${RULES.cycleIntervalMs / 1_000}s | max proposals/day: ${RULES.maxProposalsPerDay}`);

  startStatusServer();

  // Run first cycle immediately, then on interval
  await runCycle().catch(console.error);

  setInterval(() => { void runCycle().catch(console.error); }, RULES.cycleIntervalMs);
}

main().catch((err) => {
  console.error('[APE] fatal:', err);
  process.exit(1);
});
