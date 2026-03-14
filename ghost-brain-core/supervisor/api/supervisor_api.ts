/**
 * Supervisor API
 *
 * Express 5 REST API for the GhostBrain Infrastructure Supervisor.
 * Exposes status, metrics, and a human-override action endpoint.
 *
 * All mutating actions (restart, rebuild) require explicit human invocation
 * via POST /action. The supervisor AI loop itself runs independently.
 *
 * Port: 9100 (env: SUPERVISOR_PORT)
 */

import express, { Request, Response, NextFunction } from "express";
import type { MetricsSnapshot }   from "../brain/decision_engine.js";
import type { MetricsCollector }  from "../monitoring/metrics_collector.js";
import type { DecisionEngine }    from "../brain/decision_engine.js";
import type { AutoRepair }        from "../automation/auto_repair.js";
import type { ProposalExecutor }  from "../governance/proposal_executor.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SupervisorApiDeps {
  metricsCollector: MetricsCollector;
  decisionEngine:   DecisionEngine;
  autoRepair:       AutoRepair;
  proposalExecutor: ProposalExecutor;
  supervisorVersion: string;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createSupervisorApp(deps: SupervisorApiDeps): express.Application {
  const app = express();
  app.use(express.json({ limit: "64kb" }));

  // ---------------------------------------------------------------------------
  // GET /status
  // ---------------------------------------------------------------------------
  app.get("/status", (_req: Request, res: Response) => {
    res.json({
      status:  "GhostBrain Supervisor running",
      version: deps.supervisorVersion,
      time:    new Date().toISOString(),
    });
  });

  // ---------------------------------------------------------------------------
  // GET /metrics
  // ---------------------------------------------------------------------------
  app.get("/metrics", (_req: Request, res: Response) => {
    const snapshot = deps.metricsCollector.getLatestSnapshot();
    if (!snapshot) {
      res.status(503).json({ error: "Metrics not yet collected" });
      return;
    }
    res.json(snapshot);
  });

  // ---------------------------------------------------------------------------
  // GET /decisions
  // Returns the current decision list for the latest metrics snapshot.
  // ---------------------------------------------------------------------------
  app.get("/decisions", async (_req: Request, res: Response) => {
    const snapshot = deps.metricsCollector.getLatestSnapshot();
    if (!snapshot) {
      res.status(503).json({ error: "No metrics snapshot available" });
      return;
    }
    try {
      const decisions = await deps.decisionEngine.decide(snapshot);
      res.json({ decisions });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /action
  // Human-initiated override action. NOT autonomous.
  // Body: { "action": "restart_container" | "restart_vm" | "rebuild_container", "target": "<name>" }
  // ---------------------------------------------------------------------------
  app.post("/action", async (req: Request, res: Response) => {
    const { action, target } = req.body as { action?: string; target?: string };

    const ALLOWED_ACTIONS = new Set(["restart_container", "restart_vm", "rebuild_container"]);

    if (!action || !ALLOWED_ACTIONS.has(action)) {
      res.status(400).json({
        error: `Invalid action. Allowed: ${[...ALLOWED_ACTIONS].join(", ")}`,
      });
      return;
    }

    if (typeof target !== "string" || !target.trim()) {
      res.status(400).json({ error: "target is required" });
      return;
    }

    const decision = {
      kind:      action as "restart_container" | "restart_vm" | "rebuild_container",
      target:    target.trim(),
      reason:    "human-initiated override via supervisor API",
      priority:  99,
      timestamp: Date.now(),
    };

    try {
      const result = await deps.autoRepair.fix(decision);
      res.json({ result });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /governance/propose
  // Forward an alert to the signing relay for human ratification.
  // Body: { "reason": "..." }
  // ---------------------------------------------------------------------------
  app.post("/governance/propose", async (req: Request, res: Response) => {
    const { reason } = req.body as { reason?: string };

    if (typeof reason !== "string" || !reason.trim()) {
      res.status(400).json({ error: "reason is required" });
      return;
    }

    const snapshot = deps.metricsCollector.getLatestSnapshot();
    if (!snapshot) {
      res.status(503).json({ error: "No metrics snapshot available" });
      return;
    }

    try {
      const receipt = await deps.proposalExecutor.submitAlert(reason.trim(), snapshot);
      res.status(202).json({
        status:         "pending_human_ratification",
        relay_pending:  receipt.relayPendingId,
        submitted_at:   receipt.submittedAt,
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ---------------------------------------------------------------------------
  // Error handler
  // ---------------------------------------------------------------------------
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error("[SupervisorAPI] Unhandled error:", err);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}

// ---------------------------------------------------------------------------
// Standalone entry point
// ---------------------------------------------------------------------------

const PORT   = Number(process.env["SUPERVISOR_PORT"] ?? "9100");
const VERSION = process.env["SUPERVISOR_VERSION"]    ?? "0.1.0";

if (process.argv[1]?.endsWith("supervisor_api.ts") || process.argv[1]?.endsWith("supervisor_api.js")) {
  // Lazy imports to avoid circular deps when used as a library.
  const { MetricsCollector }  = await import("../monitoring/metrics_collector.js");
  const { DecisionEngine }    = await import("../brain/decision_engine.js");
  const { AutoRepair }        = await import("../automation/auto_repair.js");
  const { ProposalExecutor }  = await import("../governance/proposal_executor.js");
  const { HypervisorManager } = await import("../infrastructure/hypervisor_manager.js");
  const { VMController }      = await import("../infrastructure/vm_controller.js");
  const { DockerController }  = await import("../infrastructure/docker_controller.js");
  const { NetworkController } = await import("../infrastructure/network_controller.js");

  const hv     = new HypervisorManager();
  const vms    = new VMController();
  const docker = new DockerController();
  const net    = new NetworkController();

  const collector  = new MetricsCollector(hv, vms, docker, net);
  const engine     = new DecisionEngine();
  const repair     = new AutoRepair(docker, vms);
  const proposer   = new ProposalExecutor();

  const app = createSupervisorApp({
    metricsCollector:  collector,
    decisionEngine:    engine,
    autoRepair:        repair,
    proposalExecutor:  proposer,
    supervisorVersion: VERSION,
  });

  app.listen(PORT, () => {
    console.log(`[SupervisorAPI] Listening on port ${PORT}`);
  });
}
