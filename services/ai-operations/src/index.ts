import express, { Request, Response } from "express";
import cors   from "cors";
import cron   from "node-cron";
import "dotenv/config";

import { collectMetrics, SystemMetrics }                      from "./monitoring/metricsCollector";
import { predictFailure, PredictionReport }                   from "./prediction/failurePredictor";
import { detectAnomaly, getAnomalyHistory, AnomalyReport }    from "./anomaly/anomalyDetector";
import { respondToIncident, getIncidentLog, getOpenIncidents } from "./incident/incidentResponder";
import { getRepairLog }                                        from "./repair/repairEngine";
import { scaleInfrastructure, getScalingHistory, getLatestScalingEvent } from "./scaling/scalingEngine";
import { evaluateSystem, classifyHealth }                      from "./models/aiModels";

const app  = express();
const PORT = Number(process.env.PORT ?? 9988);

app.use(cors());
app.use(express.json());

// ── Loop state ────────────────────────────────────────────────────────────────
const loop = {
  running:    false,
  cycleCount: 0,
  lastRun:    null as number | null,
  lastError:  null as string | null,
  phaseLog:   [] as string[],
};

let latestMetrics:    SystemMetrics    | null = null;
let latestPrediction: PredictionReport | null = null;
let latestAnomaly:    AnomalyReport    | null = null;

function log(msg: string): void {
  const entry = `[${new Date().toISOString()}] ${msg}`;
  loop.phaseLog.push(entry);
  if (loop.phaseLog.length > 100) loop.phaseLog.splice(0, loop.phaseLog.length - 100);
  console.log(entry);
}

// ── AIOps main loop ───────────────────────────────────────────────────────────
async function runAIOpsLoop(): Promise<void> {
  if (loop.running) return;
  loop.running    = true;
  loop.cycleCount++;
  loop.lastRun    = Date.now();
  loop.lastError  = null;

  try {
    log(`AIOps cycle #${loop.cycleCount} — STARTING`);

    // Phase 1: Collect infrastructure metrics
    log("Phase 1/5 — Collecting infrastructure metrics");
    latestMetrics = await collectMetrics();
    log(`  → ${latestMetrics.totalNodes} nodes | online: ${latestMetrics.onlineNodes} | avgCpu: ${latestMetrics.avgCpu.toFixed(0)}%`);

    // Phase 2: Predict failures
    log("Phase 2/5 — Running failure prediction model");
    latestPrediction = await predictFailure(latestMetrics);
    log(`  → Overall risk: ${latestPrediction.overallRisk} | high-risk nodes: ${latestPrediction.highRiskCount}`);

    // Phase 3: Detect anomalies
    log("Phase 3/5 — Running anomaly detection");
    latestAnomaly = await detectAnomaly(latestMetrics);
    if (latestAnomaly.anomaly) {
      log(`  → ⚠ ${latestAnomaly.anomalies.length} anomalies detected: ${latestAnomaly.reason}`);
    } else {
      log("  → No anomalies detected");
    }

    // Phase 4: Respond to incidents
    log("Phase 4/5 — Evaluating incident response");
    if (latestPrediction.overallRisk === "high" || latestPrediction.overallRisk === "critical") {
      const incident = await respondToIncident({
        type:        "node_overload",
        description: `Overall system risk level: ${latestPrediction.overallRisk}`,
      });
      log(`  → ${incident.id}: ${incident.response}`);
    }
    if (latestAnomaly.anomaly) {
      // Cap at 2 incident responses per cycle to avoid flooding
      for (const anomaly of latestAnomaly.anomalies.slice(0, 2)) {
        const incident = await respondToIncident({
          type:        "anomaly",
          node:        anomaly.nodeId,
          description: anomaly.description,
        });
        log(`  → ${incident.id}: ${incident.response}`);
      }
    }

    // Phase 5: Evaluate auto-scaling
    log("Phase 5/5 — Evaluating auto-scaling");
    const scalingEvent = await scaleInfrastructure(latestMetrics);
    log(`  → Scaling: ${scalingEvent.action} — ${scalingEvent.reason}`);

    log(`AIOps cycle #${loop.cycleCount} — COMPLETE`);
  } catch (e) {
    loop.lastError = e instanceof Error ? e.message : "unknown error";
    log(`AIOps cycle #${loop.cycleCount} — ERROR: ${loop.lastError}`);
  } finally {
    loop.running = false;
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────
app.get("/health", (_req: Request, res: Response): void => {
  res.json({ status: "ok", service: "ai-operations", port: PORT, timestamp: Date.now() });
});

app.get("/summary", (_req: Request, res: Response): void => {
  const metrics = latestMetrics;
  const score   = metrics
    ? evaluateSystem({ cpu: metrics.avgCpu, memory: metrics.avgMemory, network: Math.min(100, metrics.avgNetwork / 10) })
    : 0;

  res.json({
    status:        "operational",
    cycleCount:    loop.cycleCount,
    lastRun:       loop.lastRun,
    overallRisk:   latestPrediction?.overallRisk ?? "unknown",
    healthTier:    classifyHealth(score),
    systemScore:   Math.round(score),
    anomalyActive: latestAnomaly?.anomaly ?? false,
    openIncidents: getOpenIncidents().length,
    onlineNodes:   metrics?.onlineNodes ?? 0,
    totalNodes:    metrics?.totalNodes  ?? 0,
    avgCpu:        Math.round(metrics?.avgCpu    ?? 0),
    avgMemory:     Math.round(metrics?.avgMemory ?? 0),
    latestScaling: getLatestScalingEvent(),
    timestamp:     Date.now(),
  });
});

app.get("/metrics", (_req: Request, res: Response): void => {
  if (!latestMetrics) {
    res.status(503).json({ error: "Metrics not yet collected — first loop pending" });
    return;
  }
  res.json(latestMetrics);
});

app.get("/predictions", (_req: Request, res: Response): void => {
  if (!latestPrediction) {
    res.status(503).json({ error: "Predictions not yet generated" });
    return;
  }
  res.json(latestPrediction);
});

app.get("/anomalies", (_req: Request, res: Response): void => {
  res.json({
    current:   latestAnomaly ?? { anomaly: false, anomalies: [], reason: "none" },
    history:   getAnomalyHistory().slice(-50),
    timestamp: Date.now(),
  });
});

app.get("/incidents", (_req: Request, res: Response): void => {
  res.json({
    log:       getIncidentLog().slice(-100),
    open:      getOpenIncidents(),
    total:     getIncidentLog().length,
    timestamp: Date.now(),
  });
});

app.get("/scaling", (_req: Request, res: Response): void => {
  res.json({
    history:   getScalingHistory().slice(-50),
    latest:    getLatestScalingEvent(),
    timestamp: Date.now(),
  });
});

app.get("/repair", (_req: Request, res: Response): void => {
  res.json({ log: getRepairLog().slice(-50), timestamp: Date.now() });
});

app.get("/loop/status", (_req: Request, res: Response): void => {
  res.json({ ...loop, timestamp: Date.now() });
});

app.post("/loop/run", (_req: Request, res: Response): void => {
  if (loop.running) {
    res.json({ queued: false, message: "Loop already running" });
    return;
  }
  runAIOpsLoop().catch(console.error);
  res.json({ queued: true, message: "AIOps loop triggered", cycle: loop.cycleCount + 1 });
});

// ── Cron: every 30 seconds ────────────────────────────────────────────────────
cron.schedule("*/30 * * * * *", () => {
  runAIOpsLoop().catch(console.error);
});

// ── Startup ───────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[AIOps] GhostStack AI Operations Center listening on port ${PORT}`);
  // First loop after 2s so the HTTP server is fully bound
  setTimeout(() => runAIOpsLoop().catch(console.error), 2_000);
});
