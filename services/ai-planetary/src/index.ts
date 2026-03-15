import express, { Request, Response } from "express";
import cors       from "cors";
import cron       from "node-cron";
import dotenv     from "dotenv";
import logger     from "./utils/logger";

import { deployNode, getNodes, getNodeStats, REGION_LIST }              from "./deployment/globalNodeDeploy";
import { configureRegion, getRegionConfigs, getRegionActions, getRegionStats } from "./regions/regionalInfrastructure";
import { routeTraffic, getRoutes, getDecisions, getRoutingStats }        from "./routing/trafficRouter";
import { optimizeLatency, getLatencyMatrix, getEdgeActions, getLatencyStats } from "./optimization/latencyOptimizer";
import { monitorPlanet, getHealthHistory, getLatestSnapshot, getIncidents, resolveIncident, getGlobalStats } from "./monitoring/globalMonitor";

dotenv.config();

const app  = express();
const PORT = parseInt(process.env.PORT ?? "9984", 10);

app.use(cors());
app.use(express.json());

// ── Loop state ──────────────────────────────────────────────────────────────

interface LoopState {
  running: boolean;
  cycleCount: number;
  lastRun: number | null;
  lastError: string | null;
  phaseLog: string[];
}

const loopState: LoopState = { running: false, cycleCount: 0, lastRun: null, lastError: null, phaseLog: [] };

async function runPlanetaryLoop() {
  if (loopState.running) { logger.warn("[PNE] Loop already running — skipping"); return; }
  loopState.running  = true;
  loopState.phaseLog = [];

  const log = (msg: string) => { loopState.phaseLog.push(msg); logger.info(`[PNE Loop] ${msg}`); };

  try {
    log("Phase 1 — Monitor planet");
    const health = monitorPlanet();

    log(`Phase 2 — Identify underserved regions (network=${health.networkHealth})`);
    const underserved = health.byRegion.filter(r => r.nodes < 4 || r.health !== "healthy");
    if (underserved.length) {
      const target = underserved[0]!;
      log(`Phase 3 — Deploying reinforcement node in ${target.regionId}`);
      deployNode(target.regionId, "rpc-gateway", "GhostChain");
    } else {
      log("Phase 3 — No underserved regions detected");
    }

    log("Phase 4 — Optimize latency");
    const actions = optimizeLatency();
    log(`Phase 5 — Triggered ${actions.length} latency optimization action(s)`);

    log("Phase 6 — Routing sweep complete");
    loopState.cycleCount++;
    loopState.lastRun   = Date.now();
    loopState.lastError = null;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    loopState.lastError = msg;
    logger.error(`[PNE Loop] Error: ${msg}`);
  } finally {
    loopState.running = false;
  }
}

// ── Routes ───────────────────────────────────────────────────────────────────

app.get("/health", (_req, res: Response) => {
  const snap = getLatestSnapshot();
  res.json({
    status: "ok", service: "GhostPlanetaryNetworkEngine", port: PORT, version: "1.0.0",
    uptime: Math.floor(process.uptime()),
    loop: { ...loopState },
    network: snap?.networkHealth ?? "unknown",
    healthScore: snap?.healthScore ?? 0,
    nodes: getNodeStats(),
  });
});

app.get("/summary", (_req, res: Response) => {
  res.json({
    loop:    loopState,
    global:  getGlobalStats(),
    nodes:   getNodeStats(),
    regions: getRegionStats(),
    latency: getLatencyStats(),
    routing: getRoutingStats(),
  });
});

// ── Loop ────────────────────────────────────────────────────────────────────

app.get("/loop/status", (_req, res: Response) => { res.json(loopState); });

app.post("/loop/run", async (_req, res: Response) => {
  runPlanetaryLoop().catch(logger.error);
  res.json({ triggered: true, message: "Planetary loop triggered", cycleCount: loopState.cycleCount });
});

// ── Nodes ────────────────────────────────────────────────────────────────────

app.get("/nodes", (req: Request, res: Response) => {
  const { regionId, type, network, status, limit } = req.query as Record<string, string>;
  res.json(getNodes({ regionId, type: type as any, network: network as any, status: status as any, limit: limit ? parseInt(limit) : 100 }));
});

app.get("/nodes/stats", (_req, res: Response) => { res.json(getNodeStats()); });

app.get("/nodes/regions", (_req, res: Response) => { res.json(REGION_LIST); });

app.post("/nodes/deploy", (req: Request, res: Response) => {
  try {
    const { regionId, type, network } = req.body ?? {};
    const node = deployNode(regionId, type, network);
    res.status(201).json(node);
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── Regions ──────────────────────────────────────────────────────────────────

app.get("/regions", (_req, res: Response) => { res.json(getRegionConfigs()); });

app.get("/regions/stats", (_req, res: Response) => { res.json(getRegionStats()); });

app.get("/regions/actions", (_req, res: Response) => { res.json(getRegionActions()); });

app.post("/regions/configure", (req: Request, res: Response) => {
  try {
    const { regionId } = req.body ?? {};
    const result = configureRegion(regionId);
    res.json(result);
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── Routing ───────────────────────────────────────────────────────────────────

app.get("/routes", (req: Request, res: Response) => {
  const { userRegionId, protocol, status, limit } = req.query as Record<string, string>;
  res.json(getRoutes({ userRegionId, protocol: protocol as any, status: status as any, limit: limit ? parseInt(limit) : 50 }));
});

app.get("/routes/stats", (_req, res: Response) => { res.json(getRoutingStats()); });

app.get("/routes/decisions", (req: Request, res: Response) => {
  const { limit } = req.query as Record<string, string>;
  res.json(getDecisions(limit ? parseInt(limit) : 50));
});

app.post("/routes/find", (req: Request, res: Response) => {
  try {
    const { userRegionId, protocol } = req.body ?? {};
    if (!userRegionId) { res.status(400).json({ error: "userRegionId required" }); return; }
    const route = routeTraffic(userRegionId, protocol);
    res.json(route);
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── Latency ───────────────────────────────────────────────────────────────────

app.get("/latency/matrix", (req: Request, res: Response) => {
  const { fromRegion, toRegion } = req.query as Record<string, string>;
  res.json(getLatencyMatrix(fromRegion, toRegion));
});

app.get("/latency/stats",   (_req, res: Response) => { res.json(getLatencyStats()); });
app.get("/latency/actions", (_req, res: Response) => { res.json(getEdgeActions()); });

app.post("/latency/optimize", (_req, res: Response) => {
  const actions = optimizeLatency();
  res.json({ triggered: actions.length, actions });
});

// ── Monitoring ────────────────────────────────────────────────────────────────

app.get("/monitoring/health", (_req, res: Response) => {
  const snap = monitorPlanet();
  res.json(snap);
});

app.get("/monitoring/latest", (_req, res: Response) => {
  const snap = getLatestSnapshot();
  if (!snap) { res.status(204).end(); return; }
  res.json(snap);
});

app.get("/monitoring/history", (req: Request, res: Response) => {
  const { limit } = req.query as Record<string, string>;
  res.json(getHealthHistory(limit ? parseInt(limit) : 50));
});

app.get("/monitoring/stats", (_req, res: Response) => { res.json(getGlobalStats()); });

app.get("/monitoring/incidents", (req: Request, res: Response) => {
  const { status, limit } = req.query as Record<string, string>;
  res.json(getIncidents(status as any, limit ? parseInt(limit) : 50));
});

app.post("/monitoring/incidents/:id/resolve", (req: Request, res: Response) => {
  const inc = resolveIncident(req.params.id!);
  if (!inc) { res.status(404).json({ error: "Incident not found" }); return; }
  res.json(inc);
});

// ── Crons ─────────────────────────────────────────────────────────────────────

// Planetary loop every 4 minutes
cron.schedule("*/4 * * * *", () => {
  logger.info("[PNE Cron] Running planetary loop");
  runPlanetaryLoop().catch(logger.error);
});

// Heartbeat every 1 minute — quick node latency update
cron.schedule("* * * * *", () => {
  const snap = getLatestSnapshot();
  if (snap) {
    logger.debug(`[PNE Heartbeat] ${snap.onlineNodes}/${snap.totalNodes} online, latency=${snap.avgLatency_ms}ms`);
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  logger.info(`Ghost Planetary Network Engine (PNE) running on port ${PORT}`);
  setTimeout(() => runPlanetaryLoop().catch(logger.error), 800);
});

export default app;
