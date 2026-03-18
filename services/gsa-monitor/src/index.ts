import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createLogger, transports, format } from "winston";

const app  = express();
const PORT = process.env.PORT ?? 4304;

const log = createLogger({
  level: "info",
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

app.use(helmet());
app.use(cors());
app.use(express.json());

// ─── In-memory monitoring state ───────────────────────────────────────────
type SubsystemStatus = "healthy" | "degraded" | "down" | "unknown";
interface Anomaly { id: string; subsystem: string; type: string; severity: "low" | "medium" | "high"; description: string; ts: number; resolved: boolean; }
interface Metric  { name: string; value: number | string; unit: string; ts: number; }
interface SubsystemState { name: string; status: SubsystemStatus; metrics: Metric[]; lastChecked: number; }

const subsystems = new Map<string, SubsystemState>([
  ["l1",         { name: "GhostChain L1",   status: "healthy", metrics: [], lastChecked: Date.now() }],
  ["l2",         { name: "GhostL2",          status: "healthy", metrics: [], lastChecked: Date.now() }],
  ["l3",         { name: "GhostL3",          status: "healthy", metrics: [], lastChecked: Date.now() }],
  ["bridge",     { name: "Bridge",           status: "healthy", metrics: [], lastChecked: Date.now() }],
  ["treasury",   { name: "Treasury",         status: "healthy", metrics: [], lastChecked: Date.now() }],
  ["governance", { name: "Governance",       status: "healthy", metrics: [], lastChecked: Date.now() }],
]);
const anomalies: Anomaly[] = [];

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "gsa-monitor", ts: Date.now() });
});

app.get("/overview", (_req, res) => {
  const states = [...subsystems.values()];
  const healthy  = states.filter(s => s.status === "healthy").length;
  const degraded = states.filter(s => s.status === "degraded").length;
  const down     = states.filter(s => s.status === "down").length;
  const openAnomalies = anomalies.filter(a => !a.resolved).length;
  res.json({ overall: down > 0 ? "down" : degraded > 0 ? "degraded" : "healthy", subsystems: { total: states.length, healthy, degraded, down }, openAnomalies, ts: Date.now() });
});

app.get("/anomalies", (req, res) => {
  const active = req.query.resolved === "true" ? anomalies : anomalies.filter(a => !a.resolved);
  res.json({ anomalies: active, total: active.length });
});

app.post("/anomalies", (req, res) => {
  const { subsystem, type, severity, description } = req.body as Partial<Anomaly>;
  if (!subsystem || !type || !severity || !description) {
    res.status(400).json({ error: "subsystem, type, severity and description are required" });
    return;
  }
  const anomaly: Anomaly = {
    id: `anomaly-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    subsystem, type, severity, description, ts: Date.now(), resolved: false,
  };
  anomalies.unshift(anomaly);
  log.warn("anomaly.detected", { id: anomaly.id, subsystem, severity });
  res.status(201).json({ anomaly });
});

app.post("/anomalies/:id/resolve", (req, res) => {
  const a = anomalies.find(x => x.id === req.params.id);
  if (!a) { res.status(404).json({ error: "anomaly not found" }); return; }
  a.resolved = true;
  res.json({ anomaly: a });
});

app.get("/metrics", (_req, res) => {
  const all: (Metric & { subsystem: string })[] = [];
  for (const [key, sub] of subsystems) {
    for (const m of sub.metrics) all.push({ ...m, subsystem: key });
  }
  res.json({ metrics: all, ts: Date.now() });
});

app.get("/subsystems", (_req, res) => {
  res.json({ subsystems: [...subsystems.values()] });
});

app.put("/subsystems/:id", (req, res) => {
  const sub = subsystems.get(req.params.id);
  if (!sub) { res.status(404).json({ error: "subsystem not found" }); return; }
  const { status, metrics } = req.body as { status?: SubsystemStatus; metrics?: Metric[] };
  subsystems.set(req.params.id, {
    ...sub,
    status: status ?? sub.status,
    metrics: metrics ?? sub.metrics,
    lastChecked: Date.now(),
  });
  res.json({ subsystem: subsystems.get(req.params.id) });
});


app.listen(PORT, () => log.info(`gsa-monitor listening :${PORT}`));
export default app;
