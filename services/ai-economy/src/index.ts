/**
 * ai-economy — Autonomous Economy Engine (AEE) — port 9974
 * Treasury allocation · token burn/supply control · market creation · liquidity balancing · economic simulation
 */

import express  from "express";
import cron     from "node-cron";
import dotenv   from "dotenv";
dotenv.config();

import logger                             from "./utils/logger";
import { computeAllocations, getTreasuryState } from "./treasury/treasuryAllocator";
import { burnGST, runWeeklyFeeSweep, getBurnStats } from "./tokenomics/tokenBurnEngine";
import { adjustSupply, getSupplyMetrics }           from "./tokenomics/supplyController";
import { proposeMarket, tickMarketTVL, getMarkets, getMarketSummary } from "./markets/marketCreator";
import { rebalancePools, getPools, getActions, getPoolSummary }       from "./liquidity/liquidityBalancer";
import { simulateEconomy, defaultParams }           from "./simulation/economicSimulation";

const app  = express();
const PORT = parseInt(process.env.PORT ?? "9974", 10);
app.use(express.json());

// ── Health ───────────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "ai-economy", ts: new Date().toISOString() });
});

// ── Treasury ─────────────────────────────────────────────────────────────────
app.get("/treasury",           (_req, res)  => res.json(getTreasuryState()));
app.post("/treasury/recompute", async (_req, res) => {
  try { res.json(await computeAllocations()); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Token Burns ───────────────────────────────────────────────────────────────
app.get("/burns",         (_req, res)  => res.json(getBurnStats()));
app.post("/burns/manual", async (req, res) => {
  const { amount } = req.body as { amount?: number };
  if (!amount || amount <= 0) return res.status(400).json({ error: "positive amount required" });
  try { res.json(await burnGST(amount, "manual")); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Supply Control ────────────────────────────────────────────────────────────
app.get("/supply",        (_req, res)  => res.json(getSupplyMetrics()));
app.post("/supply/adjust", async (_req, res) => {
  try { res.json(await adjustSupply()); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Markets ───────────────────────────────────────────────────────────────────
app.get("/markets",         (_req, res)  => res.json(getMarketSummary()));
app.post("/markets/propose", async (req, res) => {
  const { type } = req.body as { type?: string };
  const valid = ["defi", "nft", "prediction", "gaming", "rwa"];
  if (!type || !valid.includes(type)) return res.status(400).json({ error: `type must be one of ${valid.join(",")}` });
  try { res.json(await proposeMarket(type as any)); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});
app.post("/markets/tick",    (_req, res)  => { tickMarketTVL(); res.json({ ok: true, markets: getMarkets() }); });

// ── Liquidity ─────────────────────────────────────────────────────────────────
app.get("/liquidity",           (_req, res) => res.json({ summary: getPoolSummary(), pools: getPools(), recentActions: getActions() }));
app.post("/liquidity/rebalance", (_req, res) => {
  const triggered = rebalancePools();
  res.json({ triggered, pools: getPools() });
});

// ── Simulation ────────────────────────────────────────────────────────────────
app.post("/simulate", (req, res) => {
  try {
    const params = { ...defaultParams(), ...(req.body ?? {}) };
    res.json(simulateEconomy(params));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
app.get("/simulate/default", (_req, res) => res.json(simulateEconomy(defaultParams())));

// ── Summary ───────────────────────────────────────────────────────────────────
app.get("/summary", (_req, res) => {
  const treasury = getTreasuryState();
  const burns    = getBurnStats();
  const supply   = getSupplyMetrics();
  const pools    = getPoolSummary();
  const markets  = getMarketSummary();
  res.json({
    treasury:  { totalUSD: treasury.totalUSD, departments: treasury.allocations.length },
    burns:     { totalBurned: burns.totalBurned, events: burns.eventCount },
    supply:    { pressureRatio: supply.pressureRatio, action: supply.action, dailyEmissions: supply.dailyEmissions },
    liquidity: { totalTVL: pools.totalTVL, healthyPools: pools.healthy, avgAPR: +pools.avgAPR.toFixed(1) },
    markets:   { live: markets.live, totalTVL: markets.totalTVL },
  });
});

// ── Autonomous Cron Jobs ──────────────────────────────────────────────────────

// Treasury recompute — every 6 h
cron.schedule("0 */6 * * *", async () => {
  logger.info("CRON: recomputing treasury allocations");
  await computeAllocations();
});

// Supply adjustment — every 4 h
cron.schedule("0 */4 * * *", async () => {
  logger.info("CRON: supply adjustment tick");
  await adjustSupply();
});

// Market TVL tick — every 30 min
cron.schedule("*/30 * * * *", () => {
  logger.info("CRON: ticking market TVL");
  tickMarketTVL();
});

// Liquidity rebalance — every 2 h
cron.schedule("0 */2 * * *", () => {
  logger.info("CRON: rebalancing liquidity pools");
  rebalancePools();
});

// Weekly fee sweep burn — every Sunday midnight
cron.schedule("0 0 * * 0", async () => {
  logger.info("CRON: weekly fee sweep burn");
  await runWeeklyFeeSweep(500_000);
});

// Propose a new market type monthly on the 1st
cron.schedule("0 8 1 * *", async () => {
  logger.info("CRON: monthly market proposal");
  const types: Array<"defi" | "nft" | "prediction" | "gaming" | "rwa"> = ["defi", "nft", "prediction", "gaming", "rwa"];
  const pick = types[Math.floor(Math.random() * types.length)];
  await proposeMarket(pick);
});

app.listen(PORT, () => {
  logger.info(`ai-economy (AEE) listening on port ${PORT}`);

  // Bootstrap treasury on startup
  computeAllocations().catch(() => {});
});

export default app;
