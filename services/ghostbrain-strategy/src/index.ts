// GhostBrain Strategic Intelligence System (SIS) — Main Entry Point (Phases 83-100)
//
// GOVERNANCE MODEL (non-negotiable)
// ──────────────────────────────────
//   The SIS is FORECAST-AND-PROPOSE only.
//   Every strategy cycle runs all intelligence modules, assembles a StrategySnapshot,
//   derives governance-ready proposals, and submits them to the signing relay
//   (SIGNING_RELAY_URL, default port 7910) for HUMAN RATIFICATION.
//
//   No autonomous writes to chain state, validator config, or bridge parameters
//   are issued from this process.
//
// Strategy loop
// ─────────────
//   Cycle interval: SIS_CYCLE_INTERVAL_MS (default 120 000 ms / 2 minutes)
//   Modules (all run concurrently):
//     forecasting:  networkForecast · gasForecast · validatorLoadForecast
//     economics:    modelTokenomics · modelTreasury · buildLiquidityModel
//     routing:      optimizeLiquidity · optimizeBridge
//     scaling:      planScaling · planNodes
//
// Health API
// ──────────
//   GET /health  — liveness
//   GET /status  — current StrategySnapshot + stats (JSON)
//
//   Port: SIS_PORT (default 7925)

import http from 'node:http';
import { forecastNetwork }     from './forecasting/networkForecast.js';
import { gasForecast }         from './forecasting/gasForecast.js';
import { validatorForecast }   from './forecasting/validatorLoadForecast.js';
import { modelTokenomics }     from './economics/tokenomicsModel.js';
import { modelTreasury }       from './economics/treasuryForecast.js';
import { optimizeLiquidity }   from './routing/liquidityRouter.js';
import { optimizeBridge }      from './routing/bridgeOptimizer.js';
import { planScaling }         from './scaling/chainScalingPlanner.js';
import { planNodes }           from './scaling/nodeExpansionPlanner.js';
import {
  TARGETS,
  SIGNING_RELAY_URL,
  DRY_RUN,
  CYCLE_INTERVAL_MS,
  SIS_PORT,
} from './config/strategyTargets.js';
import type {
  StrategySnapshot,
  StrategyProposal,
  RiskLevel,
} from './types.js';

// ── Engine state ─────────────────────────────────────────────────────────────

const state = {
  phase:              'idle' as 'idle' | 'forecasting' | 'modeling' | 'routing' | 'scaling' | 'proposing',
  cycleCount:         0,
  forecastsRun:       0,
  proposalsGenerated: 0,
  proposalsSubmitted: 0,
  proposalsFailed:    0,
  lastCycleAt:        null as string | null,
  currentSnapshot:    null as StrategySnapshot | null,
  recentProposals:    [] as StrategyProposal[],
};
const MAX_RECENT_PROPOSALS = 50;
const START_TIME           = Date.now();

// ── Daily proposal guard ──────────────────────────────────────────────────────

const _proposalTimestamps: number[] = [];
function canSubmitProposal(): boolean {
  const now    = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1_000;
  const recent = _proposalTimestamps.filter(t => t >= dayAgo);
  return recent.length < TARGETS.maxProposalsPerDay;
}
function recordProposal(): void {
  _proposalTimestamps.push(Date.now());
}

// ── Proposal helpers ──────────────────────────────────────────────────────────

function makeId(): string {
  return `sis-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function aggregateRisk(levels: RiskLevel[]): RiskLevel {
  if (levels.includes('critical')) return 'critical';
  if (levels.includes('high'))     return 'high';
  if (levels.includes('moderate')) return 'moderate';
  return 'low';
}

async function submitProposal(proposal: StrategyProposal): Promise<void> {
  if (DRY_RUN) {
    console.info(`[SIS][DRY_RUN] Proposal generated (not submitted): ${proposal.title}`);
    proposal.status = 'dry_run';
    return;
  }

  try {
    const r = await globalThis.fetch(`${SIGNING_RELAY_URL}/proposals`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ ...proposal, requestedBy: 'ghostbrain-strategy' }),
      signal:  AbortSignal.timeout(8_000),
    });
    proposal.status = r.ok ? 'submitted' : 'submit_failed';
    if (r.ok) {
      state.proposalsSubmitted++;
      recordProposal();
      console.info(`[SIS] Proposal submitted for governance ratification: ${proposal.title}`);
    } else {
      state.proposalsFailed++;
      console.warn(`[SIS] Proposal submission failed (${r.status}): ${proposal.title}`);
    }
  } catch (err) {
    proposal.status = 'submit_failed';
    state.proposalsFailed++;
    console.warn(`[SIS] Signing relay unreachable: ${(err as Error).message}`);
  }
}

// ── Strategy cycle ────────────────────────────────────────────────────────────

async function runCycle(): Promise<void> {
  state.cycleCount++;
  state.lastCycleAt = new Date().toISOString();

  console.info(`\n[SIS] ── cycle #${state.cycleCount} starting ─────────────────────────`);

  // 1. Forecasting (all in parallel)
  state.phase = 'forecasting';
  const [networkForecast, gasFore, validatorFore] = await Promise.all([
    forecastNetwork(),
    gasForecast(),
    validatorForecast(),
  ]);
  state.forecastsRun += 3;
  console.info(`[SIS] Forecasting done — network:${networkForecast.level} gas:${gasFore.level} validators:${validatorFore.level}`);

  // 2. Economic modeling (parallel)
  state.phase = 'modeling';
  const [tokenomics, treasury] = await Promise.all([
    modelTokenomics(),
    modelTreasury(),
  ]);
  state.forecastsRun += 2;
  console.info(`[SIS] Economics done — burn_rec:${tokenomics.burnRecommended} shortfall:${treasury.liquidityShortfall}%`);

  // 3. Routing optimization (liquidity model is shared; router runs first)
  state.phase = 'routing';
  const [routing, bridge] = await Promise.all([
    optimizeLiquidity(),
    optimizeBridge(),
  ]);
  state.forecastsRun += 2;
  console.info(`[SIS] Routing done — liquidity_optimal:${routing.optimal} bridge_actions:${bridge.actions.length}`);

  // 4. Scaling (parallel)
  state.phase = 'scaling';
  const [scaling, nodes] = await Promise.all([
    planScaling(),
    planNodes(),
  ]);
  state.forecastsRun += 2;
  console.info(`[SIS] Scaling done — chain_action:${scaling.recommendAction} node_expansion:${nodes.expansion.length}`);

  // 5. Assemble snapshot
  const recommendations: string[] = [
    ...(networkForecast.recommendation ? [networkForecast.recommendation] : []),
    ...(gasFore.recommendation         ? [gasFore.recommendation]         : []),
    ...(validatorFore.recommendation   ? [validatorFore.recommendation]   : []),
    ...(treasury.recommendation        ? [treasury.recommendation]        : []),
    ...(tokenomics.burnRecommended && tokenomics.burnDeltaRec
      ? [`Increase GST burn rate by +${tokenomics.burnDeltaRec}% to counter supply inflation — submit via governance`]
      : []),
    ...routing.actions,
    ...bridge.actions,
    ...(scaling.action   ? [scaling.action]   : []),
    ...nodes.expansion,
  ];

  const riskLevel = aggregateRisk([
    networkForecast.level,
    gasFore.level,
    validatorFore.level,
  ]);

  const snapshot: StrategySnapshot = {
    networkForecast,
    gasForecast:      gasFore,
    validatorForecast: validatorFore,
    treasuryForecast:  treasury,
    liquidityModel: {
      l1Balance:       0,
      l2Balance:       0,
      l3Balance:       0,
      imbalancePct:    0,
      ts:              new Date().toISOString(),
    },
    routingResult:    routing,
    bridgeResult:     bridge,
    scalingPlan:      scaling,
    nodeExpansion:    nodes,
    tokenomics,
    recommendations,
    riskLevel,
    generatedAt:      new Date().toISOString(),
  };
  state.currentSnapshot = snapshot;

  // 6. Generate and submit actionable proposals
  state.phase = 'proposing';
  const proposals: StrategyProposal[] = [];

  if (scaling.recommendAction && scaling.action) {
    proposals.push({
      id:          makeId(),
      title:       'L3 Chain Scaling Required',
      description: scaling.action,
      risk:        'high',
      action:      'deploy_l3_block_producers',
      module:      'chainScalingPlanner',
      payload:     { currentLoadPct: scaling.currentLoadPct, projectedLoadPct: scaling.projectedLoadPct },
      status:      'pending',
      createdAt:   new Date().toISOString(),
    });
  }

  if (tokenomics.burnRecommended && tokenomics.burnDeltaRec) {
    proposals.push({
      id:          makeId(),
      title:       'GST Burn Rate Adjustment',
      description: `Increase burn rate by +${tokenomics.burnDeltaRec}% to counteract supply inflation (current: ${tokenomics.inflationRate}%)`,
      risk:        'moderate',
      action:      'adjust_burn_rate',
      module:      'tokenomicsModel',
      payload:     { currentBurnRate: tokenomics.burnRate, delta: tokenomics.burnDeltaRec },
      status:      'pending',
      createdAt:   new Date().toISOString(),
    });
  }

  if (!routing.optimal && routing.actions.length > 0) {
    proposals.push({
      id:          makeId(),
      title:       'Cross-Chain Liquidity Rebalance',
      description: routing.actions.join('; '),
      risk:        'moderate',
      action:      'rebalance_liquidity',
      module:      'liquidityRouter',
      payload:     { l1Pct: routing.l1Pct, l2Pct: routing.l2Pct, l3Pct: routing.l3Pct },
      status:      'pending',
      createdAt:   new Date().toISOString(),
    });
  }

  // Submit proposals to signing relay for human ratification
  for (const proposal of proposals) {
    if (!canSubmitProposal()) {
      console.warn(`[SIS] Daily proposal cap reached (${TARGETS.maxProposalsPerDay}); skipping: ${proposal.title}`);
      break;
    }
    state.proposalsGenerated++;
    await submitProposal(proposal);
    state.recentProposals.unshift(proposal);
    if (state.recentProposals.length > MAX_RECENT_PROPOSALS) {
      state.recentProposals.length = MAX_RECENT_PROPOSALS;
    }
  }

  state.phase = 'idle';
  console.info(`[SIS] ── cycle #${state.cycleCount} complete — risk:${riskLevel} recommendations:${recommendations.length} proposals:${proposals.length}`);
}

// ── Strategy loop ─────────────────────────────────────────────────────────────

async function strategyLoop(): Promise<void> {
  console.log('GhostBrain Strategic Intelligence System running');
  console.log(`  Port   : ${SIS_PORT}`);
  console.log(`  Cycle  : ${CYCLE_INTERVAL_MS / 1000}s`);
  console.log(`  DryRun : ${DRY_RUN}`);
  console.log(`  Relay  : ${SIGNING_RELAY_URL}`);

  while (true) {
    try {
      await runCycle();
    } catch (err) {
      console.error('[SIS] Cycle error:', (err as Error).message);
      state.phase = 'idle';
    }
    await new Promise(r => setTimeout(r, CYCLE_INTERVAL_MS));
  }
}

// ── HTTP health + status API ──────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${SIS_PORT}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'ghostbrain-strategy', uptimeSec: Math.floor((Date.now() - START_TIME) / 1000) }));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      phase:              state.phase,
      cycleCount:         state.cycleCount,
      forecastsRun:       state.forecastsRun,
      proposalsGenerated: state.proposalsGenerated,
      proposalsSubmitted: state.proposalsSubmitted,
      proposalsFailed:    state.proposalsFailed,
      lastCycleAt:        state.lastCycleAt,
      currentSnapshot:    state.currentSnapshot,
      recentProposals:    state.recentProposals,
      dryRun:             DRY_RUN,
      cycleIntervalMs:    CYCLE_INTERVAL_MS,
      targets:            TARGETS,
      ts:                 new Date().toISOString(),
    }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(SIS_PORT, () => {
  console.info(`[SIS] Health API listening on :${SIS_PORT}`);
});

// ── Start ─────────────────────────────────────────────────────────────────────

strategyLoop().catch(err => {
  console.error('[SIS] Fatal error:', err);
  process.exit(1);
});
