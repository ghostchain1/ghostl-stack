/**
 * Ghost Autonomous Economic Engine — HTTP server
 *
 * Port: AEE_PORT (default 7980)
 * Cycle: every 2 minutes (cron: "0 every2min * * * *" — see AEE_CYCLE_CRON)
 *
 * Integrates with:
 *   GhostBrain Core   :7900  — AI brain coordination
 *   Signing Relay     :7910  — proposal submission (advisory only)
 *   GNI               :7970  — network metrics
 *   GhostChain L1 RPC :18545 — on-chain data
 *   Cosmos LCD        :1317  — validator data
 *
 * All economic decisions are submitted as advisory proposals to the signing
 * relay. No autonomous execution without governance ratification.
 */

import express, { type Request, type Response } from 'express';
import cron                                      from 'node-cron';
import { register, Counter, Gauge }              from 'prom-client';

import { monitorTreasury, getTreasuryHistory }   from './treasury/treasuryMonitor.js';
import { allocateFunds, evaluateAllocation }     from './treasury/treasuryAllocator.js';
import { assessLiquidity, getPoolStates }        from './liquidity/liquidityManager.js';
import { optimizeRewards, getValidatorMetrics }  from './rewards/validatorRewards.js';
import { evaluateBurn }                          from './burn/burnEngine.js';
import { planYieldStrategies }                   from './yield/crossChainYield.js';
import { getAvailableStrategies }                from './yield/strategyPlanner.js';
import { analyzeMarket, getMarketMetrics }       from './intelligence/marketAnalyzer.js';
import { recordSample, computeEconomicForecast, getLastForecast } from './intelligence/economicForecast.js';
import { getRecentProposals, getTotalProposalCount }              from './proposals.js';
import { type AeeStatus, type TreasuryState, type Allocation }   from './types.js';

// ── Runtime state ──────────────────────────────────────────────────────────────

const PORT      = Number(process.env.AEE_PORT  ?? 7980);
const DRY_RUN   = process.env.AEE_DRY_RUN === '1';
const CRON_EXPR = process.env.AEE_CYCLE_CRON ?? '0 */2 * * * *';
const START_TS  = Date.now();

let _running      = false;
let _totalCycles  = 0;
let _errors       = 0;
let _lastCycleMs: number | null = null;

let _treasury:  TreasuryState | null = null;
let _allocation: Allocation   | null = null;

// ── Prometheus metrics ─────────────────────────────────────────────────────────

const cCycles    = new Counter({ name: 'aee_cycles_total',    help: 'Total AEE analysis cycles' });
const cErrors    = new Counter({ name: 'aee_errors_total',    help: 'Total AEE cycle errors' });
const cProposals = new Counter({ name: 'aee_proposals_total', help: 'Total advisory proposals submitted' });
const gTreasury  = new Gauge({   name: 'aee_treasury_gst',    help: 'Treasury balance in GST' });
const gTps       = new Gauge({   name: 'aee_tps_avg',         help: 'Avg TPS over sampling window' });
const gInflation = new Gauge({   name: 'aee_inflation_rate_pct_per_year', help: 'Projected annual inflation %' });

// ── Economic cycle ─────────────────────────────────────────────────────────────

async function runEconomicCycle(): Promise<void> {
  const start = Date.now();
  _totalCycles++;
  cCycles.inc();

  try {
    // 1. Treasury
    const treasury = await monitorTreasury();
    if (treasury) {
      _treasury   = treasury;
      _allocation = allocateFunds(treasury);
      gTreasury.set(treasury.balanceGst);
    }

    // 2. Market analysis
    const market = await analyzeMarket(getTreasuryHistory());
    gTps.set(market.tpsAvg);

    // 3. Forecast (requires at least 3 market samples recorded)
    const validators = getValidatorMetrics();
    if (_treasury) recordSample(market, _treasury, validators);
    const forecast = computeEconomicForecast();
    if (forecast) gInflation.set(forecast.inflationRatePctPerYear);

    // 4. Burn evaluation
    if (_treasury) await evaluateBurn(market, _treasury);

    // 5. Validator rewards
    await optimizeRewards();

    // 6. Liquidity
    if (_allocation) await assessLiquidity(_allocation);

    // 7. Yield strategies
    if (_treasury) await planYieldStrategies(_treasury, market);

    // 8. Allocation proposal (gated by interval internally)
    if (_treasury) await evaluateAllocation(_treasury);

    // Prometheus — proposals counter sync
    cProposals.reset();
    cProposals.inc(getTotalProposalCount());

    _lastCycleMs = Date.now() - start;
    console.log(`[AEE] cycle complete in ${_lastCycleMs}ms`);
  } catch (err) {
    _errors++;
    cErrors.inc();
    console.error('[AEE] cycle error:', (err as Error).message);
  }
}

// ── Express app ────────────────────────────────────────────────────────────────

const app = express();
app.disable('x-powered-by');

// Health
app.get('/health',  (_req: Request, res: Response) => { res.json({ ok: true }); });
app.get('/healthz', (_req: Request, res: Response) => { res.json({ ok: true }); });

// Status
app.get('/status', (_req: Request, res: Response) => {
  const status: AeeStatus = {
    running:     _running,
    dryRun:      DRY_RUN,
    totalCycles: _totalCycles,
    errors:      _errors,
    proposals:   getTotalProposalCount(),
    lastCycleMs: _lastCycleMs,
    uptime:      Math.floor((Date.now() - START_TS) / 1000),
    treasury:    _treasury,
    allocation:  _allocation,
    market:      getMarketMetrics(),
    forecast:    getLastForecast(),
    validators:  getValidatorMetrics(),
  };
  res.json(status);
});

// Treasury
app.get('/treasury', (_req: Request, res: Response) => {
  res.json({ treasury: _treasury, allocation: _allocation });
});

// Market
app.get('/market', (_req: Request, res: Response) => {
  res.json(getMarketMetrics() ?? { error: 'no market data yet' });
});

// Forecast
app.get('/forecast', (_req: Request, res: Response) => {
  const f = getLastForecast();
  if (!f) { res.status(202).json({ message: 'Collecting samples, check back after next cycle' }); return; }
  res.json(f);
});

// Burn assessment (read-only view)
app.get('/burn', (_req: Request, res: Response) => {
  const market = getMarketMetrics();
  const burnThreshold = Number(process.env.AEE_BURN_TPS_THRESHOLD ?? 300);
  const surplusThreshold = Number(process.env.AEE_BURN_SURPLUS_GST ?? 50_000_000);
  res.json({
    currentTps:         market?.tpsAvg ?? null,
    burnTpsThreshold:   burnThreshold,
    burnSurplusGst:     surplusThreshold,
    highTps:            (market?.tpsAvg ?? 0) > burnThreshold,
    treasurySurplus:    (_treasury?.balanceGst ?? 0) > surplusThreshold,
    burnAmountGst:      Number(process.env.AEE_BURN_AMOUNT_GST ?? 10_000),
  });
});

// Validators (read-only)
app.get('/validators', (_req: Request, res: Response) => {
  res.json(getValidatorMetrics() ?? { error: 'no validator data yet' });
});

// Liquidity pools
app.get('/liquidity', (_req: Request, res: Response) => {
  res.json({ pools: getPoolStates() });
});

// Yield strategies
app.get('/yield', (_req: Request, res: Response) => {
  res.json({ strategies: getAvailableStrategies() });
});

// Proposals
app.get('/proposals/recent', (req: Request, res: Response) => {
  const limit = Math.min(100, Math.max(1, Number(req.query['limit'] ?? 20)));
  res.json({ proposals: getRecentProposals(limit), total: getTotalProposalCount() });
});

// Prometheus
app.get('/metrics', async (_req: Request, res: Response) => {
  res.set('Content-Type', register.contentType);
  res.send(await register.metrics());
});

// ── Start ──────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  _running = true;
  console.log(`[AEE] Ghost Autonomous Economic Engine listening on :${PORT}${DRY_RUN ? ' [DRY-RUN]' : ''}`);

  // Run one cycle immediately, then on cron
  void runEconomicCycle();
  cron.schedule(CRON_EXPR, () => { void runEconomicCycle(); });
});
