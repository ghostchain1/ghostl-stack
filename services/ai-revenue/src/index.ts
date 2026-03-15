import express, { Request, Response } from "express";
import cors from "cors";
import cron from "node-cron";

import { getPools, getPool, getPoolStats, rebalancePool, getActionLog as getDeFiLog, tickLiquidity, manageLiquidity } from "./defi/liquidityEngine";
import { getValidators, getValidator, getValidatorStats, calculateValidatorRewards, distributeValidatorRewards, getDistributionLog, tickValidators } from "./validators/validatorRewards";
import { getStrategies, getStrategy, getStrategyStats, runTradingStrategy, setStrategyStatus, getTradeLog, tickTrading } from "./trading/tradingEngine";
import { getJobs, getJob, getMarketplaceStats, allocateCompute, tickCompute } from "./marketplace/computeMarketplace";
import { getClients, getClient, getSaaSStats, provisionService, getServiceLog, tickSaaS } from "./saas/blockchainSaaS";
import {
  getTreasuryBalance, getDistributions, getSnapshotHistory, getLatestSnapshot,
  getRevenueStats, distributeRevenue, captureSnapshot, tickTreasury,
} from "./treasury/treasuryDistributor";

const app  = express();
const PORT = Number(process.env.PORT ?? 9987);

app.use(cors());
app.use(express.json());

// ── Loop state ─────────────────────────────────────────────────────────────────
const loop = { running: false, cycleCount: 0, lastRun: null as number | null, lastError: null as string | null, phaseLog: [] as string[] };

function log(msg: string) {
  const entry = `[${new Date().toISOString()}] ${msg}`;
  loop.phaseLog.push(entry);
  if (loop.phaseLog.length > 100) loop.phaseLog.splice(0, loop.phaseLog.length - 100);
  console.log(entry);
}

// ── Autonomous Revenue Loop ────────────────────────────────────────────────────
async function runAreLoop() {
  if (loop.running) return;
  loop.running = true;
  loop.cycleCount++;
  loop.lastRun = Date.now();
  loop.phaseLog = [];
  try {
    log(`ARE cycle #${loop.cycleCount} — STARTING`);

    // Phase 1: Manage liquidity
    log("Phase 1/6 — Managing DeFi liquidity pools");
    const liqResult = await manageLiquidity();
    log(`  → Pool ${liqResult.pool}: ${liqResult.action} (TVL $${liqResult.tvlUSD.toLocaleString()})`);

    // Phase 2: Calculate validator rewards
    log("Phase 2/6 — Calculating validator rewards");
    const valResult = await calculateValidatorRewards();
    log(`  → ${valResult.validators} validators | pending: ${valResult.rewardsDistributed}`);

    // Phase 3: Run trading strategies
    log("Phase 3/6 — Executing trading strategies");
    const tradeResult = await runTradingStrategy();
    log(`  → Strategy "${tradeResult.strategy}": ${tradeResult.tradesExecuted} trades, P&L $${tradeResult.pnlUSD.toFixed(2)}`);

    // Phase 4: Snapshot revenue
    log("Phase 4/6 — Capturing revenue snapshot");
    const pools   = getPoolStats();
    const valStats = getValidatorStats();
    const trdStats = getStrategyStats();
    const mktStats = getMarketplaceStats();
    const saasStats = getSaaSStats();
    const snap = captureSnapshot(
      pools.totalFees24hUSD / 24,
      valStats.totalPendingGST * 2.84 / 24,
      Math.max(0, trdStats.totalPnlUSD / 720),
      mktStats.totalRevenueGST * 2.84 / 8760,
      saasStats.monthlyRevenueUSD / 720,
    );
    log(`  → Snapshot: $${snap.totalUSD.toFixed(2)} accumulated this period`);

    // Phase 5: Auto-distribute if accumulated > $10k
    const revStats = getRevenueStats();
    if (revStats.accumulatedPendingUSD >= 10_000) {
      log("Phase 5/6 — Auto-distributing revenue (threshold reached)");
      const dist = await distributeRevenue(revStats.accumulatedPendingUSD);
      log(`  → Distributed $${dist.totalUSD.toFixed(2)}: treasury=$${dist.treasuryUSD.toFixed(2)}, validators=$${dist.validatorsUSD.toFixed(2)}, ecosystem=$${dist.ecosystemUSD.toFixed(2)}`);
    } else {
      log(`Phase 5/6 — Accumulating revenue ($${revStats.accumulatedPendingUSD.toFixed(2)} / $10,000 threshold)`);
    }

    // Phase 6: Tick telemetry
    log("Phase 6/6 — Ticking telemetry");
    tickLiquidity(); tickValidators(); tickTrading(); tickCompute(); tickSaaS(); tickTreasury();

    log(`ARE cycle #${loop.cycleCount} — COMPLETE`);
    loop.lastError = null;
  } catch (err) {
    loop.lastError = String(err);
    log(`ARE cycle #${loop.cycleCount} — ERROR: ${err}`);
  } finally {
    loop.running = false;
  }
}

// Full loop every 5 minutes; telemetry tick every minute
cron.schedule("*/5 * * * *", runAreLoop);
cron.schedule("* * * * *",   () => { tickLiquidity(); tickValidators(); tickTrading(); tickCompute(); tickSaaS(); tickTreasury(); });

// ── Routes ─────────────────────────────────────────────────────────────────────

// Health & Summary
app.get("/health", (_req: Request, res: Response) => {
  const t = getTreasuryBalance();
  res.json({ status: "ok", service: "GhostStackAutonomousRevenueEngine", port: PORT, loop: { running: loop.running, cycles: loop.cycleCount, lastRun: loop.lastRun }, treasury: { totalUSD: t.totalUSD, gstPriceUSD: t.gstPriceUSD } });
});

app.get("/summary", (_req: Request, res: Response) => {
  res.json({
    defi:       getPoolStats(),
    validators: getValidatorStats(),
    trading:    getStrategyStats(),
    marketplace:getMarketplaceStats(),
    saas:       getSaaSStats(),
    treasury:   getRevenueStats(),
  });
});

// Loop
app.get("/loop/status", (_req: Request, res: Response) => res.json(loop));
app.post("/loop/run",   async (_req: Request, res: Response) => { runAreLoop(); res.json({ started: true, cycle: loop.cycleCount }); });

// ── DeFi Liquidity ─────────────────────────────────────────────────────────────
app.get("/defi/pools", (req: Request, res: Response) => {
  res.json(getPools({ chain: req.query.chain as never, state: req.query.state as never }));
});
app.get("/defi/pools/stats",   (_req: Request, res: Response) => res.json(getPoolStats()));
app.get("/defi/pools/actions", (_req: Request, res: Response) => res.json(getDeFiLog()));
app.get("/defi/pools/:id",     (req: Request, res: Response) => {
  const p = getPool(req.params.id);
  if (!p) return res.status(404).json({ error: "Pool not found" });
  res.json(p);
});
app.post("/defi/pools/:id/rebalance", (req: Request, res: Response) => res.json(rebalancePool(req.params.id)));
app.post("/defi/manage",              async (_req: Request, res: Response) => res.json(await manageLiquidity()));

// ── Validators ─────────────────────────────────────────────────────────────────
app.get("/validators", (req: Request, res: Response) => {
  res.json(getValidators({ status: req.query.status as never }));
});
app.get("/validators/stats",    (_req: Request, res: Response) => res.json(getValidatorStats()));
app.get("/validators/history",  (_req: Request, res: Response) => res.json(getDistributionLog()));
app.get("/validators/:id",      (req: Request, res: Response) => {
  const v = getValidator(req.params.id);
  if (!v) return res.status(404).json({ error: "Validator not found" });
  res.json(v);
});
app.post("/validators/distribute", async (_req: Request, res: Response) => {
  const result = await calculateValidatorRewards();
  const dist   = distributeValidatorRewards();
  res.json({ ...result, ...dist });
});

// ── Trading ────────────────────────────────────────────────────────────────────
app.get("/trading/strategies", (req: Request, res: Response) => {
  res.json(getStrategies({ status: req.query.status as never, type: req.query.type as never }));
});
app.get("/trading/strategies/stats",     (_req: Request, res: Response) => res.json(getStrategyStats()));
app.get("/trading/strategies/trades",    (req: Request, res: Response) =>  res.json(getTradeLog(Number(req.query.limit ?? 50))));
app.get("/trading/strategies/:id",       (req: Request, res: Response) => {
  const s = getStrategy(req.params.id);
  if (!s) return res.status(404).json({ error: "Strategy not found" });
  res.json(s);
});
app.post("/trading/strategies/:id/run",  async (req: Request, res: Response) => res.json(await runTradingStrategy(req.params.id)));
app.post("/trading/strategies/:id/pause",      (req: Request, res: Response) => res.json(setStrategyStatus(req.params.id, "paused")));
app.post("/trading/strategies/:id/resume",     (req: Request, res: Response) => res.json(setStrategyStatus(req.params.id, "running")));

// ── Compute Marketplace ────────────────────────────────────────────────────────
app.get("/marketplace/jobs", (req: Request, res: Response) => {
  res.json(getJobs({ state: req.query.state as never, type: req.query.type as never }));
});
app.get("/marketplace/stats",  (_req: Request, res: Response) => res.json(getMarketplaceStats()));
app.get("/marketplace/jobs/:id",(req: Request, res: Response) => {
  const j = getJob(req.params.id);
  if (!j) return res.status(404).json({ error: "Job not found" });
  res.json(j);
});
app.post("/marketplace/jobs",  async (req: Request, res: Response) => {
  const { type, client, computeUnits, gpuCount } = req.body as { type: never; client: string; computeUnits: number; gpuCount?: number };
  if (!type || !computeUnits) return res.status(400).json({ error: "type and computeUnits are required" });
  res.json(await allocateCompute({ type, client: client ?? "anonymous", computeUnits, gpuCount }));
});

// ── Blockchain SaaS ────────────────────────────────────────────────────────────
app.get("/saas/clients", (req: Request, res: Response) => {
  res.json(getClients({ status: req.query.status as never, service: req.query.service as never }));
});
app.get("/saas/stats",    (_req: Request, res: Response) => res.json(getSaaSStats()));
app.get("/saas/log",      (_req: Request, res: Response) => res.json(getServiceLog()));
app.get("/saas/clients/:id", (req: Request, res: Response) => {
  const c = getClient(req.params.id);
  if (!c) return res.status(404).json({ error: "Client not found" });
  res.json(c);
});
app.post("/saas/clients", async (req: Request, res: Response) => {
  const { client, service, chain, monthlyFeeUSD } = req.body as { client: string; service: never; chain?: string; monthlyFeeUSD?: number };
  if (!client || !service) return res.status(400).json({ error: "client and service are required" });
  res.json(await provisionService({ client, service, chain, monthlyFeeUSD }));
});

// ── Treasury ───────────────────────────────────────────────────────────────────
app.get("/treasury/balance",       (_req: Request, res: Response) => res.json(getTreasuryBalance()));
app.get("/treasury/distributions", (_req: Request, res: Response) => res.json(getDistributions()));
app.get("/treasury/history",       (req: Request, res: Response) => res.json(getSnapshotHistory(Number(req.query.limit ?? 48))));
app.get("/treasury/snapshot",      (_req: Request, res: Response) => res.json(getLatestSnapshot()));
app.get("/treasury/stats",         (_req: Request, res: Response) => res.json(getRevenueStats()));
app.post("/treasury/distribute",   async (req: Request, res: Response) => {
  const amount = req.body?.amount as number | undefined;
  res.json(await distributeRevenue(amount));
});

// ── Start ──────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🌐 GhostStack Autonomous Revenue Engine listening on port ${PORT}`);
  runAreLoop();
});
