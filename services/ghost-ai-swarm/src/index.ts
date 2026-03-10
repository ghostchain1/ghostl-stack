/**
 * Ghost AI Swarm — Express 5 HTTP API
 * Port: GHOST_SWARM_PORT (default 4080)
 *
 * Security:
 *  - HMAC-SHA256 on all POST trigger endpoints (GHOST_SWARM_MODE=prod)
 *  - Zod input validation on every request body
 *  - DRY_RUN=1 per-agent (no autonomous writes in default configuration)
 *  - No shell execution — all agent actions via HTTP to GACK/GNMC/GhostBrain
 */
import express from "express";
import { z } from "zod";

import { startSwarm, isStarted } from "./swarm/swarm-controller";
import { swarmHealth }           from "./monitoring/swarm-health";
import { swarmBus }              from "./communication/swarm-bus";
import { register, SWARM_EVENTS_TOTAL } from "./metrics";
import { hmacAuth }              from "./auth";

import { triggerBuild }      from "./agents/builder-agent";
import { triggerAudit }      from "./agents/auditor-agent";
import { triggerDefend }     from "./agents/defender-agent";
import { triggerOptimize }   from "./agents/optimizer-agent";
import { triggerInfraRepair }from "./agents/infra-agent";
import { triggerGovernance } from "./agents/governance-agent";
import { triggerTreasury }   from "./agents/treasury-agent";
import { repairCode }        from "./tasks/code-repair";
import { repairInfrastructure } from "./tasks/infra-repair";

// ── Zod schemas ──────────────────────────────────────────────────────────────
const BuildSchema = z.object({
  target: z.string().min(1).max(256),
  dryRun: z.boolean().optional(),
});

const AuditSchema = z.object({
  target: z.string().min(1).max(256),
  deep:   z.boolean().optional(),
});

const DefendSchema = z.object({
  source:   z.string().min(1).max(128),
  severity: z.enum(["low", "medium", "high", "critical"]),
  detail:   z.string().min(1).max(1024),
});

const OptimizeSchema = z.object({
  target: z.string().max(128).optional(),
});

const InfraRepairSchema = z.object({
  layer:  z.enum(["L1", "L2", "L3"]).optional(),
  target: z.string().max(128).optional(),
});

const GovernanceSchema = z.object({
  kind:    z.string().min(1).max(128),
  payload: z.record(z.unknown()),
});

const TreasurySchema = z.object({
  action: z.enum(["audit", "rebalance", "report"]),
  token:  z.string().max(16).optional(),
});

// ── App factory (exported for tests) ────────────────────────────────────────
export function buildApp() {
  const app = express();
  app.use(express.json({ limit: "64kb" }));

  // ── System ───────────────────────────────────────────────────────────────
  app.get("/swarm-health", (_req, res) => {
    res.json(swarmHealth());
  });

  app.get("/health", (_req, res) => {
    res.json(swarmHealth());
  });

  app.get("/status", (_req, res) => {
    res.json({
      service: "@ghostchain/ghost-ai-swarm",
      version: "1.0.0",
      started: isStarted(),
      ts: new Date().toISOString(),
    });
  });

  app.get("/metrics", async (_req, res) => {
    res.set("Content-Type", register.contentType);
    res.send(await register.metrics());
  });

  app.get("/bus/history", (_req, res) => {
    res.json({ events: swarmBus.getHistory(50) });
  });

  // ── Agents ───────────────────────────────────────────────────────────────
  app.post("/agents/build", hmacAuth, async (req, res) => {
    const parsed = BuildSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    SWARM_EVENTS_TOTAL.inc({ event: "build-code" });
    const result = await triggerBuild(parsed.data);
    res.json(result);
  });

  app.post("/agents/audit", hmacAuth, async (req, res) => {
    const parsed = AuditSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    SWARM_EVENTS_TOTAL.inc({ event: "audit-code" });
    const result = await triggerAudit(parsed.data);
    res.json(result);
  });

  app.post("/agents/defend", hmacAuth, async (req, res) => {
    const parsed = DefendSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    SWARM_EVENTS_TOTAL.inc({ event: "security-alert" });
    const result = await triggerDefend(parsed.data);
    res.json(result);
  });

  app.post("/agents/optimize", hmacAuth, async (req, res) => {
    const parsed = OptimizeSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    SWARM_EVENTS_TOTAL.inc({ event: "optimize-system" });
    const result = await triggerOptimize(parsed.data);
    res.json(result);
  });

  app.post("/agents/infra", hmacAuth, async (req, res) => {
    const parsed = InfraRepairSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    SWARM_EVENTS_TOTAL.inc({ event: "infra-repair" });
    const result = await triggerInfraRepair(parsed.data);
    res.json(result);
  });

  app.post("/agents/governance", hmacAuth, async (req, res) => {
    const parsed = GovernanceSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    SWARM_EVENTS_TOTAL.inc({ event: "governance-action" });
    const result = await triggerGovernance(parsed.data);
    res.json(result);
  });

  app.post("/agents/treasury", hmacAuth, async (req, res) => {
    const parsed = TreasurySchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    SWARM_EVENTS_TOTAL.inc({ event: "treasury-action" });
    const result = await triggerTreasury(parsed.data);
    res.json(result);
  });

  // ── Tasks (convenience wrappers) ─────────────────────────────────────────
  app.post("/tasks/code-repair", hmacAuth, (req, res) => {
    const target = (req.body as Record<string, unknown>)?.target;
    const safeTarget = typeof target === "string" && target.length <= 256 ? target : "ghostchain";
    repairCode(safeTarget);
    res.json({ ok: true, task: "code-repair", target: safeTarget, ts: new Date().toISOString() });
  });

  app.post("/tasks/infra-repair", hmacAuth, (req, res) => {
    const parsed = InfraRepairSchema.safeParse(req.body ?? {});
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    repairInfrastructure(parsed.data);
    res.json({ ok: true, task: "infra-repair", ...parsed.data, ts: new Date().toISOString() });
  });

  return app;
}

// ── Entry point ──────────────────────────────────────────────────────────────
const PORT = parseInt(process.env["GHOST_SWARM_PORT"] ?? "4080", 10);

const app = buildApp();
startSwarm();

app.listen(PORT, () => {
  console.log(`Ghost AI Swarm running on port ${PORT}`);
});

export default app;
