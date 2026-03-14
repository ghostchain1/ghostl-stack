/**
 * Ghost AI Intelligence Engine (GIE) — port 9977
 *
 * The meta-intelligence layer of GhostBrain.  Provides long-term memory,
 * predictive analytics, adaptive learning, decision optimisation and a
 * knowledge graph across all 7 GhostStack AI engines.
 *
 * Endpoints
 * ─────────────────────────────────────────────────────────────────────
 * GET  /health
 * GET  /summary
 *
 * GET  /memory/events          — recent memory feed (query: limit, category)
 * GET  /memory/stats           — ring buffer statistics
 * POST /memory/store           — manually inject a memory event
 *
 * GET  /data/snapshot          — latest ecosystem snapshot
 * GET  /data/history           — snapshot history (query: limit)
 *
 * GET  /predictions            — all current forecasts (30/60/90 d)
 * GET  /predictions/history    — past predictions (query: limit)
 *
 * GET  /learning/model         — current weight model
 * GET  /learning/insights      — top learning insights (query: limit)
 * GET  /learning/stats         — learning loop statistics
 *
 * GET  /decisions              — all logged decisions (query: limit)
 * GET  /decisions/pending      — open / pending decisions
 * GET  /decisions/stats        — counts by status and priority
 * POST /decisions/optimize     — run optimiser immediately
 * PATCH /decisions/:id         — update status (body: { status })
 *
 * GET  /knowledge/graph        — full node + edge graph (query: type, limit)
 * GET  /knowledge/neighbours/:id — neighbours of a given node
 * GET  /knowledge/stats        — graph summary
 */

import express, { Request, Response, NextFunction } from "express";
import cron    from "node-cron";
import dotenv  from "dotenv";
import logger  from "./utils/logger";

import { seedInitialMemories, storeMemory, getMemories, getMemoryStats } from "./memory/memoryStore";
import { collectSnapshot, getLatestSnapshot, getSnapshotHistory }       from "./data/dataAggregator";
import { runPredictions, getLatestPredictions, getPredictionHistory }   from "./prediction/predictionEngine";
import { learnFromMemories, getModel, getInsights, getLearningStats }   from "./learning/learningEngine";
import {
  optimizeDecisions, getDecisions, getPendingDecisions,
  getDecisionStats, updateDecisionStatus, type DecisionStatus,
} from "./decisions/decisionOptimizer";
import {
  seedKnowledgeGraph, queryNodes, queryEdges, getNeighbours,
  getStats as getKGStats, addNode, addEdge, type NodeType,
} from "./knowledge/knowledgeGraph";

dotenv.config();

const PORT    = Number(process.env.PORT ?? 9977);
const SERVICE = "GIE";

// ── Express ───────────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

// CORS — allow all during development
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});
app.options("*", (_req: Request, res: Response) => res.sendStatus(204));

// ── /health ───────────────────────────────────────────────────────────────────

app.get("/health", (_req: Request, res: Response) => {
  res.json({
    service:   SERVICE,
    status:    "healthy",
    timestamp: Date.now(),
    uptime:    process.uptime(),
    version:   "1.0.0",
  });
});

// ── /summary ──────────────────────────────────────────────────────────────────

app.get("/summary", (_req: Request, res: Response) => {
  const snap  = getLatestSnapshot();
  const preds = getLatestPredictions();
  const pred30= preds.find((p) => p.horizon === "30d");
  const kgStats = getKGStats();
  const lStats  = getLearningStats();
  const dStats  = getDecisionStats();
  const mStats  = getMemoryStats();

  res.json({
    service:  SERVICE,
    timestamp: Date.now(),
    memory:   { total: mStats.total, byCategory: mStats.byCategory },
    ecosystem: {
      onlineCount:  snap ? Object.values(snap.services).filter((s) => s.online).length : 0,
      totalEngines: snap ? Object.keys(snap.services).length : 9,
      users:        snap?.users ?? null,
      tvl:          snap?.tvl   ?? null,
      validators:   snap?.validators ?? null,
      threats:      snap?.threats    ?? null,
    },
    predictions: pred30
      ? {
          horizon:    "30d",
          confidence: pred30.confidence,
          method:     pred30.method,
          users:      pred30.predictions.users.forecast,
          tvl:        pred30.predictions.tvl.forecast,
          validators: pred30.predictions.validators.forecast,
          ecosystemHealth: pred30.predictions.ecosystemHealth,
        }
      : null,
    learning: {
      cycles:       lStats.cycles,
      totalSignals: lStats.totalSignals,
      modelVersion: lStats.modelVersion,
    },
    decisions: {
      pending:  dStats.pending,
      total:    dStats.total,
      critical: dStats.byPriority.critical,
    },
    knowledge: {
      nodes: kgStats.nodes,
      edges: kgStats.edges,
    },
  });
});

// ── Memory ────────────────────────────────────────────────────────────────────

app.get("/memory/events", (req: Request, res: Response) => {
  const limit    = Math.min(Number(req.query.limit ?? 50), 500);
  const category = req.query.category as string | undefined;
  const since    = req.query.since ? Number(req.query.since) : undefined;
  const tag      = req.query.tag   as string | undefined;
  res.json(getMemories({ limit, category: category as import("./memory/memoryStore").MemoryCategory, since, tag }));
});

app.get("/memory/stats", (_req: Request, res: Response) => {
  res.json(getMemoryStats());
});

app.post("/memory/store", (req: Request, res: Response) => {
  const { category, event, data, source, importance, outcome, tags } = req.body as {
    category:   string;
    event:      string;
    data?:      Record<string, unknown>;
    source?:    string;
    importance?: string;
    outcome?:   string;
    tags?:      string[];
  };

  if (!category || !event) {
    res.status(400).json({ error: "category and event are required" });
    return;
  }

  const record = storeMemory(
    category as Parameters<typeof storeMemory>[0],
    event,
    data ?? {},
    { source, importance: importance as import("./memory/memoryStore").MemoryImportance, outcome: outcome as ("positive" | "negative" | "neutral" | "unknown"), tags },
  );
  res.status(201).json(record);
});

// ── Data ──────────────────────────────────────────────────────────────────────

app.get("/data/snapshot", (_req: Request, res: Response) => {
  const snap = getLatestSnapshot();
  if (!snap) { res.status(204).send(); return; }
  res.json(snap);
});

app.get("/data/history", (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit ?? 24), 288);
  res.json(getSnapshotHistory(limit));
});

// ── Predictions ───────────────────────────────────────────────────────────────

app.get("/predictions", (_req: Request, res: Response) => {
  res.json(getLatestPredictions());
});

app.get("/predictions/history", (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit ?? 60), 300);
  res.json(getPredictionHistory(limit));
});

// ── Learning ──────────────────────────────────────────────────────────────────

app.get("/learning/model", (_req: Request, res: Response) => {
  res.json(getModel());
});

app.get("/learning/insights", (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  res.json(getInsights(limit));
});

app.get("/learning/stats", (_req: Request, res: Response) => {
  res.json(getLearningStats());
});

// ── Decisions ─────────────────────────────────────────────────────────────────

app.get("/decisions", (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  res.json(getDecisions(limit));
});

app.get("/decisions/pending", (_req: Request, res: Response) => {
  res.json(getPendingDecisions());
});

app.get("/decisions/stats", (_req: Request, res: Response) => {
  res.json(getDecisionStats());
});

app.post("/decisions/optimize", async (_req: Request, res: Response) => {
  const snap  = getLatestSnapshot();
  const preds = getLatestPredictions();
  const recs  = optimizeDecisions(snap, preds);
  res.json({ generated: recs.length, decisions: recs });
});

app.patch("/decisions/:id", (req: Request, res: Response) => {
  const { id }     = req.params;
  const { status } = req.body as { status?: DecisionStatus };
  if (!status || !["pending", "executed", "dismissed"].includes(status)) {
    res.status(400).json({ error: "status must be one of: pending, executed, dismissed" });
    return;
  }
  const ok = updateDecisionStatus(id, status);
  if (!ok) { res.status(404).json({ error: "Decision not found" }); return; }
  res.json({ ok: true, id, status });
});

// ── Knowledge graph ───────────────────────────────────────────────────────────

app.get("/knowledge/graph", (req: Request, res: Response) => {
  const type  = req.query.type  as NodeType | undefined;
  const limit = Math.min(Number(req.query.limit ?? 100), 500);
  res.json({
    nodes: queryNodes(type, limit),
    edges: queryEdges(undefined, limit),
  });
});

app.get("/knowledge/neighbours/:id", (req: Request, res: Response) => {
  const { id } = req.params;
  res.json(getNeighbours(id));
});

app.get("/knowledge/stats", (_req: Request, res: Response) => {
  res.json(getKGStats());
});

app.post("/knowledge/node", (req: Request, res: Response) => {
  const { type, label, properties, id } = req.body as {
    type: NodeType; label: string; properties?: Record<string, unknown>; id?: string;
  };
  if (!type || !label) {
    res.status(400).json({ error: "type and label are required" });
    return;
  }
  res.status(201).json(addNode(type, label, properties, id));
});

app.post("/knowledge/edge", (req: Request, res: Response) => {
  const { from, to, relationship, weight, properties } = req.body as {
    from: string; to: string; relationship: string; weight?: number;
    properties?: Record<string, unknown>;
  };
  if (!from || !to || !relationship) {
    res.status(400).json({ error: "from, to, and relationship are required" });
    return;
  }
  const edge = addEdge(from, to, relationship, weight, properties);
  if (!edge) { res.status(422).json({ error: "One or both node IDs not found" }); return; }
  res.status(201).json(edge);
});

// ── Cron jobs ─────────────────────────────────────────────────────────────────

/** Every 30 s — collect ecosystem snapshot */
cron.schedule("*/30 * * * * *", async () => {
  try { await collectSnapshot(); }
  catch (err) { logger.error("[Cron:collect] Error", { err }); }
});

/** Every 2 min — learn from recent memory events */
cron.schedule("*/2 * * * *", () => {
  try { learnFromMemories(); }
  catch (err) { logger.error("[Cron:learn] Error", { err }); }
});

/** Every 5 min — refresh predictions */
cron.schedule("*/5 * * * *", async () => {
  try { await runPredictions(); }
  catch (err) { logger.error("[Cron:predict] Error", { err }); }
});

/** Every 10 min — optimise decisions */
cron.schedule("*/10 * * * *", () => {
  try {
    const snap  = getLatestSnapshot();
    const preds = getLatestPredictions();
    optimizeDecisions(snap, preds);
  }
  catch (err) { logger.error("[Cron:optimize] Error", { err }); }
});

/** Every 6 h — rebuild knowledge-graph (merge new nodes discovered from snapshots) */
cron.schedule("0 */6 * * *", () => {
  try { seedKnowledgeGraph(); }
  catch (err) { logger.error("[Cron:knowledge] Error", { err }); }
});

// ── Startup ───────────────────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  logger.info(`[${SERVICE}] Bootstrapping Ghost AI Intelligence Engine…`);

  // Seed deterministic starting state
  seedInitialMemories();
  seedKnowledgeGraph();

  // First data collection + intelligence passes
  await collectSnapshot();
  await runPredictions();
  learnFromMemories();
  optimizeDecisions(getLatestSnapshot(), getLatestPredictions());

  app.listen(PORT, () => {
    logger.info(`[${SERVICE}] Listening on port ${PORT}`);
  });
}

bootstrap().catch((err) => {
  logger.error(`[${SERVICE}] Fatal startup error`, { err });
  process.exit(1);
});
