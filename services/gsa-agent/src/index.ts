import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createLogger, transports, format } from "winston";

const app  = express();
const PORT = process.env.PORT ?? 4306;

const log = createLogger({
  level: "info",
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

app.use(helmet());
app.use(cors());
app.use(express.json());

// ─── In-memory agent registry ───────────────────────────────────────────────────
type AgentStatus = "pending" | "active" | "suspended" | "decommissioned";
interface AIAgent {
  id: string;
  name: string;
  type: string;
  status: AgentStatus;
  capabilities: string[];
  endpoint?: string;
  registeredAt: number;
  updatedAt: number;
}

const agentRegistry = new Map<string, AIAgent>();

// Seed built-in GhostBrain agents
for (const [name, type, capabilities] of [
  ["GhostBrain-Core",   "ai-engine",      ["classify", "score", "predict"]],
  ["GhostBrain-Risk",   "risk-agent",     ["risk-score", "anomaly"]],
  ["GhostBrain-Oracle", "oracle-agent",   ["price-feed", "health-feed"]],
] as [string, string, string[]][]) {
  const id = name.toLowerCase();
  agentRegistry.set(id, { id, name, type, status: "active", capabilities, registeredAt: Date.now(), updatedAt: Date.now() });
}

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "gsa-agent", ts: Date.now() });
});

app.get("/agents", (req, res) => {
  const status = req.query.status as AgentStatus | undefined;
  let list = [...agentRegistry.values()];
  if (status) list = list.filter(a => a.status === status);
  res.json({ agents: list, total: list.length });
});

app.get("/agents/:id", (req, res) => {
  const agent = agentRegistry.get(req.params.id);
  if (!agent) { res.status(404).json({ error: "agent not found" }); return; }
  res.json({ agent });
});

app.post("/agents", (req, res) => {
  const { name, type, capabilities, endpoint } = req.body as Partial<AIAgent>;
  if (!name || !type) { res.status(400).json({ error: "name and type are required" }); return; }
  const id = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString(36)}`;
  const agent: AIAgent = {
    id, name, type,
    status: "pending",
    capabilities: capabilities ?? [],
    endpoint,
    registeredAt: Date.now(), updatedAt: Date.now(),
  };
  agentRegistry.set(id, agent);
  log.info("agent.registered", { id, name, type });
  res.status(201).json({ agent });
});

app.post("/agents/:id/activate", (req, res) => {
  const agent = agentRegistry.get(req.params.id);
  if (!agent) { res.status(404).json({ error: "agent not found" }); return; }
  if (agent.status === "suspended" || agent.status === "pending") {
    agentRegistry.set(agent.id, { ...agent, status: "active", updatedAt: Date.now() });
    log.info("agent.activated", { id: agent.id });
    res.json({ agent: agentRegistry.get(agent.id) });
  } else {
    res.status(409).json({ error: `Agent already in status '${agent.status}'` });
  }
});

app.post("/agents/:id/suspend", (req, res) => {
  const agent = agentRegistry.get(req.params.id);
  if (!agent) { res.status(404).json({ error: "agent not found" }); return; }
  if (agent.status === "active") {
    agentRegistry.set(agent.id, { ...agent, status: "suspended", updatedAt: Date.now() });
    log.info("agent.suspended", { id: agent.id });
    res.json({ agent: agentRegistry.get(agent.id) });
  } else {
    res.status(409).json({ error: `Can only suspend active agents (current: '${agent.status}')` });
  }
});


app.listen(PORT, () => log.info(`gsa-agent listening :${PORT}`));
export default app;
