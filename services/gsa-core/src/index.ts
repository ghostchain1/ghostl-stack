import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createLogger, transports, format } from "winston";

const app  = express();
const PORT = process.env.PORT ?? 4300;

const log = createLogger({
  level: "info",
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

app.use(helmet());
app.use(cors());
app.use(express.json());

// ─── In-memory agent registry ────────────────────────────────────────────────
interface AgentRecord {
  id: string;
  name: string;
  type: string;
  status: "active" | "idle" | "suspended";
  lastHeartbeat: number;
  registeredAt: number;
}
interface DispatchRecord {
  id: string;
  agentId: string;
  task: string;
  payload: unknown;
  dispatchedAt: number;
  status: "pending" | "running" | "done";
}

const agents = new Map<string, AgentRecord>();
const dispatches = new Map<string, DispatchRecord>();

// Seed a few built-in GhostBrain subsystem agents
for (const [id, name, type] of [
  ["ghostbrain-core",    "GhostBrain Core",      "ai-engine"],
  ["ghostbrain-risk",    "GhostBrain Risk",       "risk-scorer"],
  ["ghostbrain-oracle",  "GhostBrain Oracle",     "oracle-agent"],
  ["ghostbrain-policy",  "GhostBrain Policy",     "policy-enforcer"],
] as [string, string, string][]) {
  agents.set(id, { id, name, type, status: "idle", lastHeartbeat: Date.now(), registeredAt: Date.now() });
}

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "gsa-core", ts: Date.now() });
});

app.get("/status", (_req, res) => {
  const active   = [...agents.values()].filter(a => a.status === "active").length;
  const idle     = [...agents.values()].filter(a => a.status === "idle").length;
  const pending  = [...dispatches.values()].filter(d => d.status === "pending").length;
  const running  = [...dispatches.values()].filter(d => d.status === "running").length;
  res.json({
    service: "gsa-core",
    agents: { total: agents.size, active, idle },
    dispatches: { pending, running },
    ts: Date.now(),
  });
});

app.get("/agents", (_req, res) => {
  res.json({ agents: [...agents.values()], total: agents.size });
});

app.post("/agents/dispatch", (req, res) => {
  const { agentId, task, payload } = req.body as { agentId?: string; task?: string; payload?: unknown };
  if (!agentId || !task) {
    res.status(400).json({ error: "agentId and task are required" });
    return;
  }
  if (!agents.has(agentId)) {
    res.status(404).json({ error: `Agent '${agentId}' not found` });
    return;
  }
  const id = `dispatch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const record: DispatchRecord = { id, agentId, task, payload: payload ?? null, dispatchedAt: Date.now(), status: "pending" };
  dispatches.set(id, record);
  // Mark agent active
  const agent = agents.get(agentId)!;
  agents.set(agentId, { ...agent, status: "active" });
  log.info("dispatch", { id, agentId, task });
  res.status(202).json({ dispatch: record });
});

app.get("/heartbeat", (_req, res) => {
  const now = Date.now();
  const summary = [...agents.values()].map(a => ({
    id: a.id,
    name: a.name,
    status: a.status,
    lastHeartbeatMs: now - a.lastHeartbeat,
    alive: (now - a.lastHeartbeat) < 60_000,
  }));
  res.json({ heartbeat: summary, ts: now });
});

// Allow agents to POST their heartbeat
app.post("/heartbeat/:id", (req, res) => {
  const agent = agents.get(req.params.id);
  if (!agent) { res.status(404).json({ error: "agent not found" }); return; }
  agents.set(agent.id, { ...agent, lastHeartbeat: Date.now(), status: "active" });
  res.json({ ok: true, id: agent.id, ts: Date.now() });
});


app.listen(PORT, () => log.info(`gsa-core listening :${PORT}`));
export default app;
