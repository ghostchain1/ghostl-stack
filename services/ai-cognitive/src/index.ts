/**
 * GCL — GhostBrain Cognitive Layer
 * Entry point for the cognitive service (port 9989).
 * Runs a 30-second cognitive loop: learn → analyze → evolve → optimize.
 */

import express, { Request, Response, NextFunction } from "express";
import cors     from "cors";
import cron     from "node-cron";
import { config } from "dotenv";

config();

import logger from "./utils/logger";

// Memory
import { seedMemory, getAllMemory, getMemoryByAgent, getMemoryByDomain,
         getRecentMemory, getMemoryStats } from "./memory/longTermMemory";
import { seedExperiences, getAllExperiences, getExperiencesByCategory,
         getRecentExperiences, getExperienceStats,
         recordExperience } from "./memory/experienceStore";

// Learning
import { runLearningCycle, getLatestInsights } from "./learning/learningEngine";
import { analyzePatterns, getLatestPatterns }  from "./learning/patternAnalyzer";

// Evolution
import { runEvolutionCycle, getAllStrategies,
         getStrategyById, getStrategyStats }   from "./evolution/strategyEvolution";
import { refreshDecisionCache, getBestDecisions,
         getDecisionConfidence, optimizeDecision } from "./evolution/decisionOptimizer";

// Knowledge
import { seedKnowledgeGraph, getGraph, getNodesByType,
         getRelationships, getGraphStats }     from "./knowledge/knowledgeGraph";

// Agent bridge
import { storeAgentDecision, getAgentInsights,
         getCognitiveSnapshot }                from "./agents/agentMemoryAdapter";

// ── App setup ─────────────────────────────────────────────────────────────────

const app  = express();
const PORT = process.env.PORT ?? "9989";

app.use(cors());
app.use(express.json());

// ── Seed on startup ───────────────────────────────────────────────────────────

seedMemory();
seedExperiences();
seedKnowledgeGraph();

// Initial cognitive pass so data is ready before first request
const _memory      = getAllMemory();
const _experiences = getAllExperiences();
const insights     = runLearningCycle(_memory);
analyzePatterns(_memory, _experiences);
runEvolutionCycle(insights);
refreshDecisionCache(_memory);

logger.info(`GCL seeded — memory:${_memory.length} experiences:${_experiences.length} insights:${insights.length}`);

// ── Cognitive loop ────────────────────────────────────────────────────────────

let cycleCount = 0;

cron.schedule("*/30 * * * * *", () => {
  try {
    const mem  = getAllMemory();
    const exps = getAllExperiences();

    const newInsights = runLearningCycle(mem);
    analyzePatterns(mem, exps);
    runEvolutionCycle(newInsights);
    refreshDecisionCache(mem);

    cycleCount++;
    logger.info(
      `[cycle:${cycleCount}] insights=${newInsights.length} patterns=${getLatestPatterns().length} ` +
      `strategies=${getAllStrategies().length} memory=${mem.length}`,
    );
  } catch (err) {
    logger.error("Cognitive cycle error", err);
  }
});

// ── Routes ────────────────────────────────────────────────────────────────────

/** GET /health */
app.get("/health", (_req: Request, res: Response) => {
  const snapshot = getCognitiveSnapshot();
  res.json({
    service:           "ai-cognitive",
    status:            "ok",
    port:              Number(PORT),
    cycleCount,
    uptime:            process.uptime(),
    memorySize:        snapshot.memoryStats.total,
    strategiesEvolved: snapshot.strategiesCount,
    systemStatus:      snapshot.systemStatus,
    timestamp:         Date.now(),
  });
});

/** GET /summary */
app.get("/summary", (_req: Request, res: Response) => {
  res.json({
    snapshot:    getCognitiveSnapshot(),
    memStats:    getMemoryStats(),
    expStats:    getExperienceStats(),
    stratStats:  getStrategyStats(),
    graphStats:  getGraphStats(),
    topInsights: getLatestInsights().slice(0, 5),
    topPatterns: getLatestPatterns().slice(0, 5),
    cycleCount,
  });
});

/** GET /memory */
app.get("/memory", (req: Request, res: Response) => {
  const { agent, domain, limit } = req.query as Record<string, string>;
  let mem = getAllMemory();
  if (agent)  mem = mem.filter(m => m.agent  === agent);
  if (domain) mem = mem.filter(m => m.domain === domain);
  if (limit)  mem = mem.slice(-Number(limit));
  res.json({ count: mem.length, entries: mem });
});

/** GET /memory/recent */
app.get("/memory/recent", (req: Request, res: Response) => {
  const limit = Number(req.query["limit"] ?? 50);
  res.json({ entries: getRecentMemory(limit) });
});

/** GET /memory/stats */
app.get("/memory/stats", (_req: Request, res: Response) => {
  res.json(getMemoryStats());
});

/** POST /memory */
app.post("/memory", (req: Request, res: Response) => {
  const { agent, domain, action, reasoning, outcome, impact, success, successScore, tags } = req.body;
  if (!agent || !domain || !action || !reasoning || !outcome) {
    res.status(400).json({ error: "Missing required fields: agent, domain, action, reasoning, outcome" });
    return;
  }
  const entry = storeAgentDecision({
    agent, domain, action, reasoning, outcome,
    impact:       impact       ?? "medium",
    success:      success      ?? true,
    successScore: successScore ?? 0.75,
    tags:         tags         ?? [],
  });
  res.status(201).json(entry);
});

/** GET /experiences */
app.get("/experiences", (req: Request, res: Response) => {
  const { category, limit } = req.query as Record<string, string>;
  let exps = category
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? getExperiencesByCategory(category as any)
    : getRecentExperiences(Number(limit ?? 100));
  if (limit && !category) exps = exps.slice(0, Number(limit));
  res.json({ count: exps.length, experiences: exps });
});

/** POST /experience */
app.post("/experience", (req: Request, res: Response) => {
  const { category, event, description, outcome, magnitude, linkedAgent, metadata } = req.body;
  if (!category || !event || !description || !outcome) {
    res.status(400).json({ error: "Missing: category, event, description, outcome" });
    return;
  }
  const exp = recordExperience({ category, event, description, outcome, magnitude: magnitude ?? 0.5, linkedAgent, metadata });
  res.status(201).json(exp);
});

/** GET /insights */
app.get("/insights", (_req: Request, res: Response) => {
  res.json({ count: getLatestInsights().length, insights: getLatestInsights() });
});

/** GET /patterns */
app.get("/patterns", (_req: Request, res: Response) => {
  res.json({ count: getLatestPatterns().length, patterns: getLatestPatterns() });
});

/** GET /strategies */
app.get("/strategies", (_req: Request, res: Response) => {
  res.json({ count: getAllStrategies().length, strategies: getAllStrategies() });
});

/** GET /strategies/:id */
app.get("/strategies/:id", (req: Request, res: Response) => {
  const s = getStrategyById(req.params["id"] as string);
  if (!s) { res.status(404).json({ error: "Strategy not found" }); return; }
  res.json(s);
});

/** GET /decisions */
app.get("/decisions", (req: Request, res: Response) => {
  const limit = Number(req.query["limit"] ?? 20);
  res.json({ decisions: getBestDecisions(limit) });
});

/** GET /decisions/optimize */
app.get("/decisions/optimize", (req: Request, res: Response) => {
  const { action, domain } = req.query as Record<string, string>;
  if (!action) { res.status(400).json({ error: "Query param 'action' is required" }); return; }
  const result = optimizeDecision(action, domain ?? "unknown", getAllMemory());
  res.json(result);
});

/** GET /decisions/confidence */
app.get("/decisions/confidence", (req: Request, res: Response) => {
  const { action } = req.query as Record<string, string>;
  if (!action) { res.status(400).json({ error: "Query param 'action' is required" }); return; }
  const d = getDecisionConfidence(action);
  if (!d) { res.status(404).json({ error: "No confidence data for this action" }); return; }
  res.json(d);
});

/** GET /knowledge */
app.get("/knowledge", (_req: Request, res: Response) => {
  res.json(getGraph());
});

/** GET /knowledge/stats */
app.get("/knowledge/stats", (_req: Request, res: Response) => {
  res.json(getGraphStats());
});

/** GET /knowledge/nodes/:type */
app.get("/knowledge/nodes/:type", (req: Request, res: Response) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  res.json(getNodesByType(req.params["type"] as any));
});

/** GET /knowledge/node/:id/relationships */
app.get("/knowledge/node/:id/relationships", (req: Request, res: Response) => {
  res.json(getRelationships(req.params["id"] as string));
});

/** GET /agents/:agentId/insights */
app.get("/agents/:agentId/insights", (req: Request, res: Response) => {
  const mem = getAllMemory();
  const _ = getMemoryByAgent; // touch import
  void _;
  res.json(getAgentInsights(req.params["agentId"] as string));
});

// ── Error handler ─────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error("Unhandled error", err);
  res.status(500).json({ error: "Internal server error" });
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(Number(PORT), () => {
  logger.info(`GhostBrain Cognitive Layer running on port ${PORT}`);
});

export default app;
