import express, { Request, Response } from "express";
import cron                           from "node-cron";
import logger                         from "./utils/logger";
import { analyzeArchitecture, getSnapshots, getLatestSnapshot, getAnalysisStats }                               from "./architecture/architectureAnalyzer";
import { proposeUpgrade, approveProposal, rejectProposal, getProposals, getUpgradeStats }                      from "./protocols/protocolUpgrade";
import { evolveFeatures, getFeatures, getFeatureById, updateFeatureStatus, getFeatureStats }                    from "./features/featureEvolution";
import { launchChain, getChains, getChainById, getChainStats }                                                  from "./chains/chainLauncher";
import { optimizePerformance, getOptimizations, getOptimizationStats, getAllMetrics }                           from "./optimization/performanceOptimizer";
import { exploreInnovation, getInnovations, getInnovationStats }                                                from "./innovation/innovationEngine";

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 9983;
const app  = express();
app.use(express.json());

// ── Evolution Loop State ─────────────────────────────────────────────────────
type EvolveStep = "idle" | "analyzing" | "upgrading" | "evolving" | "launching" | "optimizing" | "innovating";
const loop = { running: false, step: "idle" as EvolveStep, cycles: 0, lastCycle: 0, lastDuration: 0 };

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function runEvolutionLoop() {
  if (loop.running) return;
  loop.running = true;
  const start  = Date.now();
  try {
    logger.info("[SEE] Evolution loop started");

    loop.step = "analyzing";
    const snapshot = analyzeArchitecture();
    await sleep(40);

    loop.step = "upgrading";
    if (snapshot.overallHealth < 85 || Math.random() < 0.5) {
      const proposal = proposeUpgrade();
      if (Math.random() > 0.3) approveProposal(proposal.id);
    }
    await sleep(40);

    loop.step = "evolving";
    evolveFeatures(1);
    await sleep(40);

    loop.step = "launching";
    if (Math.random() < 0.2) launchChain();
    await sleep(40);

    loop.step = "optimizing";
    optimizePerformance();
    await sleep(40);

    loop.step = "innovating";
    if (Math.random() < 0.6) exploreInnovation();

    loop.cycles++;
    loop.lastCycle    = Date.now();
    loop.lastDuration = Date.now() - start;
    logger.info(`[SEE] Evolution loop #${loop.cycles} done in ${loop.lastDuration}ms`);
  } catch (err) {
    logger.error("[SEE] Loop error:", err);
  } finally {
    loop.running = false;
    loop.step    = "idle";
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", service: "ai-evolution", port: PORT, loop, stats: {
    architecture: getAnalysisStats(), upgrades: getUpgradeStats(), features: getFeatureStats(),
    chains: getChainStats(), optimizations: getOptimizationStats(), innovations: getInnovationStats(),
  }});
});

app.get("/summary", (_req: Request, res: Response) => {
  res.json({
    service: "Ghost Self-Evolution Engine (SEE)", version: "1.0.0", port: PORT, loop,
    architecture: getAnalysisStats(), upgrades: getUpgradeStats(), features: getFeatureStats(),
    chains: getChainStats(), optimizations: getOptimizationStats(), innovations: getInnovationStats(),
    latest: getLatestSnapshot(),
  });
});

// Loop
app.get("/loop/status", (_req: Request, res: Response) => res.json(loop));
app.post("/loop/run", async (_req: Request, res: Response) => {
  if (loop.running) { res.status(409).json({ error: "Loop already running" }); return; }
  res.json({ queued: true, message: "Evolution loop triggered" });
  runEvolutionLoop();
});

// Architecture
app.get("/architecture/snapshots", (req: Request, res: Response) =>
  res.json(getSnapshots({ limit: req.query["limit"] ? parseInt(req.query["limit"] as string) : undefined })));
app.get("/architecture/latest",    (_req: Request, res: Response) => res.json(getLatestSnapshot()));
app.get("/architecture/stats",     (_req: Request, res: Response) => res.json(getAnalysisStats()));
app.post("/architecture/analyze",  (_req: Request, res: Response) => res.json(analyzeArchitecture()));

// Protocol Upgrades
app.get("/upgrades", (req: Request, res: Response) => res.json(getProposals({
  type:    req.query["type"]    as any,
  status:  req.query["status"]  as any,
  network: req.query["network"] as any,
  limit:   req.query["limit"]   ? parseInt(req.query["limit"] as string) : undefined,
})));
app.get("/upgrades/stats",    (_req: Request, res: Response) => res.json(getUpgradeStats()));
app.post("/upgrades/propose", (req: Request, res: Response) => {
  const { title, type, network } = req.body as { title?: string; type?: string; network?: string };
  res.json(proposeUpgrade(title, type as any, network as any));
});
app.post("/upgrades/:id/approve", (req: Request, res: Response) => {
  const p = approveProposal(req.params["id"]!);
  if (!p) { res.status(404).json({ error: "Proposal not found" }); return; }
  res.json(p);
});
app.post("/upgrades/:id/reject", (req: Request, res: Response) => {
  const p = rejectProposal(req.params["id"]!);
  if (!p) { res.status(404).json({ error: "Proposal not found" }); return; }
  res.json(p);
});

// Features
app.get("/features", (req: Request, res: Response) => res.json(getFeatures({
  category: req.query["category"] as any,
  status:   req.query["status"]   as any,
  limit:    req.query["limit"]    ? parseInt(req.query["limit"] as string) : undefined,
})));
app.get("/features/stats",    (_req: Request, res: Response) => res.json(getFeatureStats()));
app.get("/features/:id",       (req: Request, res: Response) => {
  const f = getFeatureById(req.params["id"]!);
  if (!f) { res.status(404).json({ error: "Feature not found" }); return; }
  res.json(f);
});
app.post("/features/evolve",  (_req: Request, res: Response) => res.json(evolveFeatures(1)));
app.patch("/features/:id/status", (req: Request, res: Response) => {
  const { status } = req.body as { status: string };
  const f = updateFeatureStatus(req.params["id"]!, status as any);
  if (!f) { res.status(404).json({ error: "Feature not found" }); return; }
  res.json(f);
});

// Chains
app.get("/chains", (req: Request, res: Response) => res.json(getChains({
  type:   req.query["type"]   as any,
  status: req.query["status"] as any,
  limit:  req.query["limit"]  ? parseInt(req.query["limit"] as string) : undefined,
})));
app.get("/chains/stats", (_req: Request, res: Response) => res.json(getChainStats()));
app.get("/chains/:id",    (req: Request, res: Response) => {
  const c = getChainById(req.params["id"]!);
  if (!c) { res.status(404).json({ error: "Chain not found" }); return; }
  res.json(c);
});
app.post("/chains/launch", (req: Request, res: Response) => {
  const { name, type, parentChain } = req.body as { name?: string; type?: string; parentChain?: string };
  res.json(launchChain(name, type as any, parentChain));
});

// Optimizations
app.get("/optimizations", (req: Request, res: Response) => res.json(getOptimizations({
  service: req.query["service"] as string | undefined,
  type:    req.query["type"]    as any,
  status:  req.query["status"]  as any,
  limit:   req.query["limit"]   ? parseInt(req.query["limit"] as string) : undefined,
})));
app.get("/optimizations/stats",  (_req: Request, res: Response) => res.json(getOptimizationStats()));
app.get("/metrics",               (req: Request, res: Response) => res.json(getAllMetrics(req.query["service"] as string | undefined)));
app.post("/optimizations/run",    (req: Request, res: Response) => {
  const { service } = req.body as { service?: string };
  res.json(optimizePerformance(service));
});

// Innovations
app.get("/innovations", (req: Request, res: Response) => res.json(getInnovations({
  domain:   req.query["domain"]   as any,
  status:   req.query["status"]   as any,
  priority: req.query["priority"] as any,
  limit:    req.query["limit"]    ? parseInt(req.query["limit"] as string) : undefined,
})));
app.get("/innovations/stats",  (_req: Request, res: Response) => res.json(getInnovationStats()));
app.post("/innovations/explore", (_req: Request, res: Response) => res.json(exploreInnovation()));

app.use((_req: Request, res: Response) => res.status(404).json({ error: "Not found" }));

// ── Cron ──────────────────────────────────────────────────────────────────────
cron.schedule("*/5 * * * *", () => { logger.info("[SEE] Cron: evolution loop"); runEvolutionLoop(); });
cron.schedule("*/15 * * * *", () => { logger.info("[SEE] Cron: architecture sweep"); analyzeArchitecture(); });

app.listen(PORT, () => {
  logger.info(`[SEE] Ghost Self-Evolution Engine running on :${PORT}`);
  setTimeout(runEvolutionLoop, 500);
});
