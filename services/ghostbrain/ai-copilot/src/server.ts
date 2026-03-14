/**
 * server.ts
 *
 * GhostBrain AI Operations Copilot (AIOC)
 * Standalone HTTP microservice — port 9850
 */

import express, { type Request, type Response, type NextFunction } from "express";
import pino from "pino";
import { processCopilotCommand } from "./copilot.js";

const PORT    = parseInt(process.env["PORT"] ?? "9850", 10);
const SERVICE = "ghostbrain-aioc";

const log = pino({
  name: SERVICE,
  level: process.env["LOG_LEVEL"] ?? "info",
  transport: process.env["NODE_ENV"] !== "production"
    ? { target: "pino-pretty", options: { colorize: true } }
    : undefined,
});

const app = express();
app.use(express.json({ limit: "64kb" }));

// ── CORS (dashboard access) ───────────────────────────────────────────────────

app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  next();
});
app.options("*", (_req: Request, res: Response) => res.sendStatus(204));

// ── Request logger ────────────────────────────────────────────────────────────

app.use((req: Request, _res: Response, next: NextFunction) => {
  log.info({ method: req.method, url: req.url }, "→");
  next();
});

// ── GET /health ───────────────────────────────────────────────────────────────

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true, service: SERVICE, port: PORT, uptime: process.uptime() });
});

// ── GET /intents ──────────────────────────────────────────────────────────────

const INTENTS = [
  // Actions
  { name: "deploy_validator",    description: "Deploy new validator nodes" },
  { name: "remove_validator",    description: "Remove validator nodes" },
  { name: "migrate_validator",   description: "Migrate validators to a new region" },
  { name: "scale_rpc",           description: "Scale RPC / AIM nodes up or down" },
  { name: "restart_node",        description: "Restart node(s)" },
  { name: "pause_service",       description: "Pause a named service" },
  { name: "resume_service",      description: "Resume a paused service" },
  { name: "security_scan",       description: "Run a network-wide security scan" },
  { name: "threat_response",     description: "Execute threat containment response" },
  { name: "firewall_update",     description: "Reload or update firewall rules" },
  { name: "optimize_gas",        description: "Optimise gas fee settings" },
  { name: "rebalance_liquidity", description: "Rebalance liquidity pools" },
  { name: "optimize_tokenomics", description: "Optimise tokenomics parameters" },
  { name: "run_simulation",      description: "Run an economic simulation" },
  { name: "sync_governance",     description: "Sync governance state" },
  { name: "governance_vote",     description: "Submit a governance vote" },
  { name: "execute_proposal",    description: "Execute a passed governance proposal" },
  { name: "evolve_agents",       description: "Trigger agent evolution cycle" },
  { name: "flush_telemetry",     description: "Flush telemetry data buffers" },
  { name: "sync_peers",          description: "Sync swarm peer connections" },
  { name: "compliance_audit",    description: "Run ACGE compliance audit" },
  { name: "deploy_contract",     description: "Deploy a smart contract" },
  { name: "sync_chain",          description: "Force blockchain sync" },
  { name: "health_check",        description: "Check overall system health" },
  { name: "emergency_shutdown",  description: "Emergency shutdown of kernel (needs confirm:true)" },
  // Queries
  { name: "query_validators",    description: "How many validators are active?" },
  { name: "query_treasury",      description: "What is the treasury balance?" },
  { name: "query_node_load",     description: "Which node has the highest CPU load?" },
  { name: "query_health",        description: "Show system health summary" },
  { name: "query_tasks",         description: "How many tasks are queued?" },
  { name: "query_alerts",        description: "Are there any active alerts?" },
  { name: "query_chain",         description: "What is the current block height?" },
  { name: "query_liquidity",     description: "What is the liquidity pool balance?" },
  { name: "query_compliance",    description: "What is the compliance score?" },
];

app.get("/intents", (_req: Request, res: Response) => {
  res.json({ intents: INTENTS });
});

// ── POST /process ─────────────────────────────────────────────────────────────

app.post("/process", (req: Request, res: Response) => {
  const { command, confirm } = req.body as { command?: unknown; confirm?: unknown };

  if (typeof command !== "string" || command.trim().length === 0) {
    res.status(400).json({ ok: false, error: "body.command must be a non-empty string" });
    return;
  }

  const confirmed = confirm === true;

  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      res.status(504).json({ ok: false, error: "Processing timed out" });
    }
  }, 15_000);

  processCopilotCommand(command.trim(), { confirm: confirmed })
    .then((result) => {
      clearTimeout(timeout);
      if (!res.headersSent) res.json(result);
    })
    .catch((err: unknown) => {
      clearTimeout(timeout);
      const msg = err instanceof Error ? err.message : String(err);
      log.error({ err: msg }, "pipeline error");
      if (!res.headersSent) res.status(500).json({ ok: false, error: msg });
    });
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  log.info({ port: PORT }, `${SERVICE} listening`);
});
