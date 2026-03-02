/**
 * GhostContractAI — Main Entry Point
 *
 * REST API:
 *   POST /pipelines/compile-test
 *   POST /pipelines/security-audit
 *   POST /pipelines/deploy         (chain: L1|L2|L3 — routing law enforced)
 *   POST /pipelines/upgrade        (proposal only — governance required)
 *   POST /pipelines/verify
 *   POST /pipelines/rollback       (governance required)
 *   GET  /registry/contracts
 *   GET  /registry/deployments?chain=
 *   GET  /reports/:pipelineId
 *   GET  /health
 *   GET  /metrics
 *
 * Auth: RBAC via JWT (or X-Role stub for devnet)
 * Routing law: enforced at every pipeline entry point
 */

import express, { type Request, type Response, type NextFunction } from "express";
import { randomUUID } from "node:crypto";
import { PORT, SERVICE_NAME, DRY_RUN, ENV } from "./config.js";
import { logger, setCorrelation } from "./logger.js";
import { getMetrics } from "./metrics.js";
import { authMiddleware, requireRole, auditLog } from "./rbac.js";
import {
  createPipeline,
  getPipeline,
  listPipelines,
  runPipeline,
} from "./runner.js";
import {
  runCompileTest,
  runSecurityAudit,
  runDeploy,
  runUpgrade,
  runVerify,
  runRollback,
} from "./pipelines.js";
import { pingLayer } from "./connectors.js";
import { RoutingLawViolationError, parseLayer } from "./routing-law.js";
import type {
  DeployRequest,
  UpgradeRequest,
  AuditRequest,
  CompileTestRequest,
} from "./types.js";

// ─── App ──────────────────────────────────────────────────────────────────────

const app = express();
app.use(express.json({ limit: "1mb" }));

// ─── Correlation ID ───────────────────────────────────────────────────────────

app.use((req: Request, _res: Response, next: NextFunction) => {
  const cid = (req.headers["x-correlation-id"] as string) ?? randomUUID();
  setCorrelation(cid);
  next();
});

// ─── Auth ─────────────────────────────────────────────────────────────────────

app.use(authMiddleware);

// ─── Health ───────────────────────────────────────────────────────────────────

app.get("/health", async (_req: Request, res: Response) => {
  const [l1, l2, l3] = await Promise.all([
    pingLayer("L1"),
    pingLayer("L2"),
    pingLayer("L3"),
  ]);
  res.json({
    ok: true,
    service: SERVICE_NAME,
    env: ENV,
    dryRun: DRY_RUN,
    layers: { L1: l1, L2: l2, L3: l3 },
  });
});

// ─── Metrics ──────────────────────────────────────────────────────────────────

app.get("/metrics", async (_req: Request, res: Response) => {
  res.set("Content-Type", "text/plain");
  res.send(await getMetrics());
});

// ─── Pipelines ────────────────────────────────────────────────────────────────

// POST /pipelines/compile-test
app.post(
  "/pipelines/compile-test",
  requireRole("operator"),
  auditLog("PIPELINE_COMPILE_TEST"),
  (req: Request, res: Response) => {
    const body = req.body as CompileTestRequest;
    const actor = req.auth?.sub ?? "anon";

    const record = createPipeline("compile-test", "ALL", body.profile !== "live", actor);
    setCorrelation(randomUUID(), record.id);

    void runPipeline(record.id, actor, (r) => runCompileTest(r, body));
    res.status(202).json({ ok: true, pipelineId: record.id });
  },
);

// POST /pipelines/security-audit
app.post(
  "/pipelines/security-audit",
  requireRole("auditor"),
  auditLog("PIPELINE_AUDIT"),
  (req: Request, res: Response) => {
    const body = req.body as AuditRequest;
    if (!body.contractPath || !body.contractName) {
      res.status(400).json({ ok: false, error: "contractPath and contractName are required" });
      return;
    }
    const actor = req.auth?.sub ?? "anon";
    const record = createPipeline("security-audit", "ALL", false, actor);
    setCorrelation(randomUUID(), record.id);

    void runPipeline(record.id, actor, (r) => runSecurityAudit(r, body));
    res.status(202).json({ ok: true, pipelineId: record.id });
  },
);

// POST /pipelines/deploy
app.post(
  "/pipelines/deploy",
  requireRole("governor"),
  auditLog("PIPELINE_DEPLOY"),
  (req: Request, res: Response) => {
    const body = req.body as DeployRequest;
    if (!body.chain || !body.contractName || !body.policyHash) {
      res.status(400).json({ ok: false, error: "chain, contractName, policyHash required" });
      return;
    }

    // Routing law check at API boundary
    try {
      parseLayer(body.chain);
    } catch (err) {
      res.status(400).json({ ok: false, error: String(err) });
      return;
    }

    const actor  = req.auth?.sub ?? "anon";
    const dryRun = body.dryRun ?? DRY_RUN;
    const record = createPipeline("deploy", body.chain, dryRun, actor);
    setCorrelation(randomUUID(), record.id);

    void runPipeline(record.id, actor, (r) => runDeploy(r, body));
    res.status(202).json({ ok: true, pipelineId: record.id, dryRun });
  },
);

// POST /pipelines/upgrade
app.post(
  "/pipelines/upgrade",
  requireRole("governor"),
  auditLog("PIPELINE_UPGRADE"),
  (req: Request, res: Response) => {
    const body = req.body as UpgradeRequest;
    if (!body.chain || !body.proxyAddress || !body.policyHash) {
      res.status(400).json({ ok: false, error: "chain, proxyAddress, policyHash required" });
      return;
    }

    const actor  = req.auth?.sub ?? "anon";
    const dryRun = body.dryRun ?? DRY_RUN;
    const record = createPipeline("upgrade", body.chain, dryRun, actor);
    setCorrelation(randomUUID(), record.id);

    void runPipeline(record.id, actor, (r) => runUpgrade(r, body));
    res.status(202).json({ ok: true, pipelineId: record.id, dryRun, note: "proposal-only; execution requires governance" });
  },
);

// POST /pipelines/verify
app.post(
  "/pipelines/verify",
  requireRole("operator"),
  auditLog("PIPELINE_VERIFY"),
  (req: Request, res: Response) => {
    const { contractAddress, chain } = req.body as { contractAddress: string; chain: string };
    if (!contractAddress || !chain) {
      res.status(400).json({ ok: false, error: "contractAddress and chain required" });
      return;
    }
    const actor  = req.auth?.sub ?? "anon";
    const record = createPipeline("verify", chain, false, actor);
    setCorrelation(randomUUID(), record.id);

    void runPipeline(record.id, actor, (r) => runVerify(r, contractAddress, chain));
    res.status(202).json({ ok: true, pipelineId: record.id });
  },
);

// POST /pipelines/rollback
app.post(
  "/pipelines/rollback",
  requireRole("governor"),
  auditLog("PIPELINE_ROLLBACK"),
  (req: Request, res: Response) => {
    const { proxyAddress, chain, previousImplementation, approvalRef } =
      req.body as {
        proxyAddress: string;
        chain: string;
        previousImplementation: string;
        approvalRef: string;
      };
    if (!proxyAddress || !chain || !previousImplementation || !approvalRef) {
      res.status(400).json({ ok: false, error: "proxyAddress, chain, previousImplementation, approvalRef required" });
      return;
    }
    const actor  = req.auth?.sub ?? "anon";
    const dryRun = DRY_RUN;
    const record = createPipeline("rollback", chain, dryRun, actor);
    setCorrelation(randomUUID(), record.id);

    void runPipeline(record.id, actor, (r) =>
      runRollback(r, proxyAddress, chain, previousImplementation, approvalRef),
    );
    res.status(202).json({ ok: true, pipelineId: record.id, dryRun });
  },
);

// ─── Reports ──────────────────────────────────────────────────────────────────

app.get("/reports/:pipelineId", requireRole("viewer"), (req: Request, res: Response) => {
  const record = getPipeline(req.params["pipelineId"] ?? "");
  if (!record) {
    res.status(404).json({ ok: false, error: "pipeline not found" });
    return;
  }
  res.json({ ok: true, pipeline: record });
});

// ─── Registry ────────────────────────────────────────────────────────────────

app.get("/registry/contracts", requireRole("viewer"), (_req: Request, res: Response) => {
  const pipelines = listPipelines();
  const deployments = pipelines
    .filter((p) => p.type === "deploy" && p.status === "succeeded")
    .map((p) => ({
      pipelineId: p.id,
      chain:      p.chain,
      deployedAt: p.finishedAt,
      result:     p.result?.summary,
      txHash:     p.result?.txHash,
      address:    p.result?.contractAddress,
    }));
  res.json({ ok: true, contracts: deployments });
});

app.get("/registry/deployments", requireRole("viewer"), (req: Request, res: Response) => {
  const chain = req.query["chain"] as string | undefined;
  const pipelines = listPipelines().filter(
    (p) => p.type === "deploy" && (!chain || p.chain === chain),
  );
  res.json({ ok: true, deployments: pipelines });
});

// ─── Error Handling ───────────────────────────────────────────────────────────

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof RoutingLawViolationError) {
    logger.error("Routing law violation", {
      fromChain: err.fromChain,
      toChain:   err.toChain,
      reason:    err.reason,
    });
    res.status(400).json({ ok: false, error: err.message, code: "ROUTING_LAW_VIOLATION" });
    return;
  }

  logger.error("Unhandled error", { error: err.message });
  res.status(500).json({ ok: false, error: "internal server error" });
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  logger.info(`GhostContractAI started`, {
    port: PORT,
    env: ENV,
    dryRun: DRY_RUN,
    service: SERVICE_NAME,
  });
  logger.info("Routing law topology loaded", {
    L1: process.env.GHOSTAI_L1_CHAIN_ID ?? "1",
    L2: process.env.GHOSTAI_L2_CHAIN_ID ?? "10",
    L3: process.env.GHOSTAI_L3_CHAIN_ID ?? "100",
  });
});

export default app;
