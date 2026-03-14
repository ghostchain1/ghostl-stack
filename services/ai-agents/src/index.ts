import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import cron from "node-cron";
import logger from "./utils/logger";

import { TaskStatus, TaskPriority } from "./coordination/agentCoordinator";
import { AgentDomain, ImpactLevel } from "./registry/agentRegistry";
import { MessageType } from "./communication/agentBus";
import { seedAgents, getAllAgents, getAgentById, updateAgentStatus, getNetworkStats, getRecentDecisions } from "./registry/agentRegistry";
import { seedMessages, sendMessage, acknowledgeMessage, getMessages, getMessageStats } from "./communication/agentBus";
import { seedTasks, createTask, updateTaskStatus, getTasks, getTaskStats, getTaskById, runCoordinationCycle, takeNetworkSnapshot, getLatestSnapshot, getSnapshotHistory, getCycleCount, getNetworkHealth } from "./coordination/agentCoordinator";

import { runInfrastructureAgent } from "./agents/infrastructureAgent";
import { runSecurityAgent }       from "./agents/securityAgent";
import { runMarketingAgent }      from "./agents/marketingAgent";
import { runGrowthAgent }         from "./agents/growthAgent";
import { runGovernanceAgent }     from "./agents/governanceAgent";
import { runEconomyAgent }        from "./agents/economyAgent";
import { runInterchainAgent }     from "./agents/interchainAgent";
import { runArchitectAgent }      from "./agents/architectAgent";
import { runAuditorAgent }        from "./agents/auditorAgent";
import { runDefenderAgent }       from "./agents/defenderAgent";
import { runStrategistAgent }     from "./agents/strategistAgent";
import { runOperatorAgent }       from "./agents/operatorAgent";

const PORT = parseInt(process.env["PORT"] ?? "9981", 10);
const app  = express();
app.use(express.json());

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});
app.options("*", (_req, res) => { res.sendStatus(200); });

// ── Agent runner map ──────────────────────────────────────────────────────────
const AGENT_RUNNERS: Record<string, () => void> = {
  "infrastructure-agent": runInfrastructureAgent,
  "security-agent":       runSecurityAgent,
  "marketing-agent":      runMarketingAgent,
  "growth-agent":         runGrowthAgent,
  "governance-agent":     runGovernanceAgent,
  "economy-agent":        runEconomyAgent,
  "interchain-agent":     runInterchainAgent,
  // Role-based agents (GAAN Tier 2)
  "architect-agent":      runArchitectAgent,
  "auditor-agent":        runAuditorAgent,
  "defender-agent":       runDefenderAgent,
  "strategist-agent":     runStrategistAgent,
  "operator-agent":       runOperatorAgent,
};

function runAllAgents(): void {
  logger.info("[GAAN] Running all agent ticks…");
  Object.values(AGENT_RUNNERS).forEach(fn => { try { fn(); } catch {} });
}

// ── Health ────────────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  const stats   = getNetworkStats();
  const health  = getNetworkHealth();
  res.json({
    status:       "ok",
    service:      "Ghost Autonomous AI Agent Network (GAAN)",
    port:         PORT,
    health,
    agents:       stats.total,
    agentsOnline: stats.idle + stats.running,
    cycleCount:   getCycleCount(),
    uptime:       process.uptime(),
    timestamp:    Date.now(),
  });
});

// ── Summary ───────────────────────────────────────────────────────────────────
app.get("/summary", (_req, res) => {
  const stats    = getNetworkStats();
  const taskSt   = getTaskStats();
  const msgSt    = getMessageStats();
  const snapshot = getLatestSnapshot();
  res.json({
    service:      "GAAN",
    version:      "1.0.0",
    networkHealth: getNetworkHealth(),
    autonomyScore: stats.avgAutonomy,
    agents: {
      total:   stats.total,
      running: stats.running,
      idle:    stats.idle,
      error:   stats.error,
      paused:  stats.paused,
    },
    tasks:    taskSt,
    messages: msgSt,
    snapshot: snapshot ? {
      timestamp:    snapshot.timestamp,
      networkHealth: snapshot.networkHealth,
      autonomyScore: snapshot.autonomyScore,
    } : null,
    timestamp: Date.now(),
  });
});

// ── Network snapshot ──────────────────────────────────────────────────────────
app.get("/network", (_req, res) => {
  const snap     = getLatestSnapshot();
  const history  = getSnapshotHistory(48);
  res.json({ latest: snap, history, timestamp: Date.now() });
});

// ── Agents ────────────────────────────────────────────────────────────────────
app.get("/agents", (req, res) => {
  let agents = getAllAgents();
  const { status, domain, limit } = req.query as Record<string, string>;
  if (status)              agents = agents.filter(a => a.status === status);
  if (domain)              agents = agents.filter(a => a.domain === domain);
  if (limit)               agents = agents.slice(0, parseInt(limit, 10));
  res.json({ agents, total: agents.length, timestamp: Date.now() });
});

app.get("/agents/:id", (req, res) => {
  const agent = getAgentById(req.params["id"]!);
  if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }
  res.json({ agent, timestamp: Date.now() });
});

app.post("/agents/:id/run", (req, res) => {
  const id  = req.params["id"]!;
  const run = AGENT_RUNNERS[id];
  if (!run) { res.status(404).json({ error: "Agent not found" }); return; }
  try { run(); } catch (err) { res.status(500).json({ error: String(err) }); return; }
  const agent = getAgentById(id);
  res.json({ success: true, agent, timestamp: Date.now() });
});

app.post("/agents/:id/pause", (req, res) => {
  const id    = req.params["id"]!;
  const agent = getAgentById(id);
  if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }
  updateAgentStatus(id, "paused");
  res.json({ success: true, status: "paused", agentId: id, timestamp: Date.now() });
});

app.post("/agents/:id/resume", (req, res) => {
  const id    = req.params["id"]!;
  const agent = getAgentById(id);
  if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }
  updateAgentStatus(id, "idle");
  res.json({ success: true, status: "idle", agentId: id, timestamp: Date.now() });
});

app.get("/agents/:id/decisions", (req, res) => {
  const { impact, limit } = req.query as Record<string, string>;
  const decisions = getRecentDecisions(
    limit ? parseInt(limit, 10) : 20,
    req.params["id"],
    impact as ImpactLevel | undefined,
  );
  res.json({ decisions, total: decisions.length, timestamp: Date.now() });
});

// ── Tasks ─────────────────────────────────────────────────────────────────────
app.get("/tasks", (req, res) => {
  const { status, domain, assignedTo, priority, limit, createdBy } = req.query as Record<string, string>;
  const tasks = getTasks({
    status:     status as TaskStatus | undefined,
    domain:     domain as AgentDomain | undefined,
    assignedTo: assignedTo as string | undefined,
    priority:   priority as TaskPriority | undefined,
    limit:      limit ? parseInt(limit, 10) : 50,
  });
  res.json({ tasks, total: tasks.length, timestamp: Date.now() });
});

app.get("/tasks/stats", (_req, res) => {
  res.json({ stats: getTaskStats(), timestamp: Date.now() });
});

app.post("/tasks", (req, res) => {
  const { type, title, description, domain, priority, createdBy } = req.body as Record<string, string>;
  if (!title || !type) { res.status(400).json({ error: "title and type are required" }); return; }
  const task = createTask({ type, title, description: description ?? "", domain: domain as AgentDomain, priority: (priority as TaskPriority) ?? "medium", createdBy: createdBy ?? "manual" });
  res.status(201).json({ task, timestamp: Date.now() });
});

app.patch("/tasks/:id/status", (req, res) => {
  const task = getTaskById(req.params["id"]!);
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }
  const { status, result } = req.body as Record<string, string>;
  if (!status) { res.status(400).json({ error: "status is required" }); return; }
  updateTaskStatus(task.id, status as "pending" | "in-progress" | "completed" | "failed" | "cancelled", result);
  res.json({ success: true, taskId: task.id, status, timestamp: Date.now() });
});

// ── Messages ──────────────────────────────────────────────────────────────────
app.get("/messages", (req, res) => {
  const { from, to, type, acknowledged, limit } = req.query as Record<string, string>;
  const messages = getMessages({
    from,
    to,
    type:         type   as MessageType | undefined,
    acknowledged: acknowledged === "true" ? true : acknowledged === "false" ? false : undefined,
    limit:        limit ? parseInt(limit, 10) : 50,
  });
  res.json({ messages, total: messages.length, timestamp: Date.now() });
});

app.get("/messages/stats", (_req, res) => {
  res.json({ stats: getMessageStats(), timestamp: Date.now() });
});

app.post("/messages/send", (req, res) => {
  const { from, to, type, subject, content, replyTo } = req.body as Record<string, string>;
  if (!from || !to || !type || !subject || !content) {
    res.status(400).json({ error: "from, to, type, subject, content are required" }); return;
  }
  const msg = sendMessage(from, to, type as "info" | "alert" | "command" | "response" | "broadcast", subject, content, replyTo);
  res.status(201).json({ message: msg, timestamp: Date.now() });
});

app.post("/messages/:id/acknowledge", (req, res) => {
  const ok = acknowledgeMessage(req.params["id"]!);
  if (!ok) { res.status(404).json({ error: "Message not found" }); return; }
  res.json({ success: true, timestamp: Date.now() });
});

// ── Coordination ──────────────────────────────────────────────────────────────
app.get("/coordination/status", (_req, res) => {
  const snapshot = getLatestSnapshot();
  const stats    = getNetworkStats();
  res.json({
    cycleCount:    getCycleCount(),
    networkHealth: getNetworkHealth(),
    autonomyScore: stats.avgAutonomy,
    snapshot,
    taskStats:     getTaskStats(),
    timestamp:     Date.now(),
  });
});

app.post("/coordination/run", (_req, res) => {
  const result   = runCoordinationCycle();
  const snapshot = takeNetworkSnapshot();
  res.json({ result, snapshot, timestamp: Date.now() });
});

// ── Decisions ─────────────────────────────────────────────────────────────────
app.get("/decisions", (req, res) => {
  const { agentId, impact, limit } = req.query as Record<string, string>;
  const decisions = getRecentDecisions(
    limit ? parseInt(limit, 10) : 30,
    agentId as string | undefined,
    impact  as ImpactLevel | undefined,
  );
  res.json({ decisions, total: decisions.length, timestamp: Date.now() });
});

app.get("/decisions/stats", (_req, res) => {
  const all     = getRecentDecisions(1000);
  const byImpact = { low: 0, medium: 0, high: 0, critical: 0 };
  all.forEach(d => { (byImpact as Record<string, number>)[d.impact] = ((byImpact as Record<string, number>)[d.impact] ?? 0) + 1; });
  res.json({ total: all.length, byImpact, timestamp: Date.now() });
});

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((_req, res) => { res.status(404).json({ error: "Not found" }); });

// ── Cron jobs ─────────────────────────────────────────────────────────────────
// Every 2 min — run all agent ticks
cron.schedule("*/2 * * * *", () => {
  try { runAllAgents(); } catch (err) { logger.error(`Cron agent-tick error: ${String(err)}`); }
});

// Every 5 min — coordination cycle + snapshot
cron.schedule("*/5 * * * *", () => {
  try {
    const result = runCoordinationCycle();
    takeNetworkSnapshot();
    logger.info(`[GAAN] Coordination cycle complete — tasks: created=${result.tasksCreated} assigned=${result.tasksAssigned} completed=${result.tasksCompleted}`);
  } catch (err) { logger.error(`Cron coordination error: ${String(err)}`); }
});

// ── Bootstrap ─────────────────────────────────────────────────────────────────
seedAgents();
seedMessages();
seedTasks();
takeNetworkSnapshot();
// Initial run of all agents to populate decisions
setTimeout(runAllAgents, 500);

app.listen(PORT, () => {
  logger.info(`[GAAN] Ghost Autonomous AI Agent Network running on port ${PORT}`);
  logger.info(`[GAAN] 7 agents registered | health: ${getNetworkHealth()}/100`);
});

export default app;
