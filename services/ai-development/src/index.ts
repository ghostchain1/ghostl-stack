import express, { Request, Response } from "express";
import cron                           from "node-cron";
import logger                         from "./utils/logger";
import { generateCode, getGeneratedFiles, updateFileStatus, getCodeStats } from "./generator/codeGenerator";
import { buildContract, getContracts, getContractById, getContractStats }  from "./contracts/contractBuilder";
import { runTests, getTestRuns, getTestStats }                             from "./testing/testRunner";
import { auditCode, getAudits, getAuditStats }                            from "./auditing/securityAudit";
import { deployContract, deployService, getDeployments, getDeploymentStats } from "./deployment/deploymentEngine";
import { triggerPipeline, getPipelines, getCIStats }                      from "./ci/ciIntegrator";

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 9982;
const app  = express();
app.use(express.json());

// ── Development Loop State ────────────────────────────────────────────────────
type LoopStep = "idle" | "generating" | "testing" | "auditing" | "deploying" | "ci";
const loop = {
  running:      false,
  step:         "idle" as LoopStep,
  cycles:       0,
  lastCycle:    0,
  lastDuration: 0,
};

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function runDevLoop() {
  if (loop.running) return;
  loop.running = true;
  const start  = Date.now();
  try {
    logger.info("[ADE] Development loop started");

    // Step 1 — Generate code
    loop.step = "generating";
    const code = generateCode();
    logger.info(`[ADE] Generated ${code.type} for ${code.service}`);
    await sleep(50);

    // Step 2 — Test
    loop.step = "testing";
    const testRun = runTests(code.service, Math.random() > 0.5 ? "unit" : "integration");
    if (testRun.status === "failed") {
      updateFileStatus(code.id, "rejected");
      logger.warn("[ADE] Code rejected — test failures");
    } else {
      updateFileStatus(code.id, "approved");
    }
    await sleep(50);

    // Step 3 — Build a contract + audit it
    loop.step = "auditing";
    const contract = buildContract();
    const audit    = auditCode(contract.name, contract.id);
    await sleep(50);

    // Step 4 — Deploy contract if audit passed
    loop.step = "deploying";
    if (audit.passed) {
      deployContract(contract.id);
    } else {
      logger.info(`[ADE] Skipping deploy — audit score ${audit.score}/100`);
    }
    await sleep(50);

    // Step 5 — CI pipeline for a random service
    loop.step = "ci";
    if (Math.random() < 0.4) {
      const services = ["ai-governance","ai-economy","ai-infrastructure","ai-security","ghostl-stack","ai-development"];
      const svc      = services[Math.floor(Math.random() * services.length)]!;
      triggerPipeline(svc);
    }

    loop.cycles++;
    loop.lastCycle    = Date.now();
    loop.lastDuration = Date.now() - start;
    logger.info(`[ADE] Loop #${loop.cycles} done in ${loop.lastDuration}ms`);
  } catch (err) {
    logger.error("[ADE] Loop error:", err);
  } finally {
    loop.running = false;
    loop.step    = "idle";
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────

app.get("/health", (_req: Request, res: Response) => {
  const up   = { code: getCodeStats(), contracts: getContractStats(), tests: getTestStats(), audits: getAuditStats(), deployments: getDeploymentStats(), ci: getCIStats() };
  const pass = up.deployments.deployed > 0 && up.ci.total > 0;
  res.json({ status: pass ? "ok" : "degraded", service: "ai-development", port: PORT, loop, stats: up });
});

app.get("/summary", (_req: Request, res: Response) => {
  res.json({
    service:     "Ghost Autonomous Development Engine (ADE)",
    version:     "1.0.0",
    port:        PORT,
    loop,
    code:        getCodeStats(),
    contracts:   getContractStats(),
    tests:       getTestStats(),
    audits:      getAuditStats(),
    deployments: getDeploymentStats(),
    ci:          getCIStats(),
  });
});

// Loop
app.get("/loop/status", (_req: Request, res: Response) => res.json(loop));
app.post("/loop/run", async (_req: Request, res: Response) => {
  if (loop.running) { res.status(409).json({ error: "Loop already running" }); return; }
  res.json({ queued: true, message: "Development loop triggered" });
  runDevLoop();
});

// Code
app.get("/code", (req: Request, res: Response) => {
  res.json(getGeneratedFiles({
    service: req.query["service"] as string | undefined,
    type:    req.query["type"]    as any,
    status:  req.query["status"]  as any,
    limit:   req.query["limit"]   ? parseInt(req.query["limit"] as string) : undefined,
  }));
});
app.get("/code/stats", (_req: Request, res: Response) => res.json(getCodeStats()));
app.post("/code/generate", (req: Request, res: Response) => {
  const { service, type, purpose } = req.body as { service?: string; type?: string; purpose?: string };
  res.json(generateCode(service, type as any, purpose));
});
app.patch("/code/:id/status", (req: Request, res: Response) => {
  const { status } = req.body as { status: string };
  const updated    = updateFileStatus(req.params["id"]!, status as any);
  if (!updated) { res.status(404).json({ error: "File not found" }); return; }
  res.json(updated);
});

// Contracts
app.get("/contracts", (req: Request, res: Response) => {
  res.json(getContracts({
    type:        req.query["type"]        as any,
    network:     req.query["network"]     as any,
    auditStatus: req.query["auditStatus"] as any,
    limit:       req.query["limit"] ? parseInt(req.query["limit"] as string) : undefined,
  }));
});
app.get("/contracts/stats",  (_req: Request, res: Response) => res.json(getContractStats()));
app.get("/contracts/:id",     (req: Request, res: Response) => {
  const c = getContractById(req.params["id"]!);
  if (!c) { res.status(404).json({ error: "Contract not found" }); return; }
  res.json(c);
});
app.post("/contracts/build", (req: Request, res: Response) => {
  const { name, type, network } = req.body as { name?: string; type?: string; network?: string };
  res.json(buildContract(name, type as any, network as any));
});

// Tests
app.get("/tests", (req: Request, res: Response) => {
  res.json(getTestRuns({
    target: req.query["target"] as string | undefined,
    type:   req.query["type"]   as any,
    status: req.query["status"] as any,
    limit:  req.query["limit"]  ? parseInt(req.query["limit"] as string) : undefined,
  }));
});
app.get("/tests/stats", (_req: Request, res: Response) => res.json(getTestStats()));
app.post("/tests/run", (req: Request, res: Response) => {
  const { target, type } = req.body as { target: string; type?: string };
  if (!target) { res.status(400).json({ error: "target required" }); return; }
  res.json(runTests(target, (type as any) ?? "unit"));
});

// Audits
app.get("/audits", (req: Request, res: Response) => {
  const passed = req.query["passed"] !== undefined ? req.query["passed"] === "true" : undefined;
  res.json(getAudits({
    target: req.query["target"] as string | undefined,
    passed,
    limit:  req.query["limit"] ? parseInt(req.query["limit"] as string) : undefined,
  }));
});
app.get("/audits/stats", (_req: Request, res: Response) => res.json(getAuditStats()));
app.post("/audits/run", (req: Request, res: Response) => {
  const { target, contractId } = req.body as { target: string; contractId?: string };
  if (!target) { res.status(400).json({ error: "target required" }); return; }
  res.json(auditCode(target, contractId));
});

// Deployments
app.get("/deployments", (req: Request, res: Response) => {
  res.json(getDeployments({
    network: req.query["network"] as any,
    type:    req.query["type"]    as any,
    status:  req.query["status"]  as any,
    limit:   req.query["limit"]   ? parseInt(req.query["limit"] as string) : undefined,
  }));
});
app.get("/deployments/stats", (_req: Request, res: Response) => res.json(getDeploymentStats()));
app.post("/deployments/deploy", (req: Request, res: Response) => {
  const { contractId, serviceName, network } = req.body as { contractId?: string; serviceName?: string; network?: string };
  if (!contractId && !serviceName) { res.status(400).json({ error: "contractId or serviceName required" }); return; }
  if (contractId) { res.json(deployContract(contractId, network as any)); return; }
  res.json(deployService(serviceName!));
});

// CI
app.get("/ci", (req: Request, res: Response) => {
  res.json(getPipelines({
    repo:   req.query["repo"]   as string | undefined,
    branch: req.query["branch"] as string | undefined,
    status: req.query["status"] as any,
    limit:  req.query["limit"]  ? parseInt(req.query["limit"] as string) : undefined,
  }));
});
app.get("/ci/stats", (_req: Request, res: Response) => res.json(getCIStats()));
app.post("/ci/trigger", (req: Request, res: Response) => {
  const { repo, branch } = req.body as { repo: string; branch?: string };
  if (!repo) { res.status(400).json({ error: "repo required" }); return; }
  res.json(triggerPipeline(repo, branch));
});

// 404
app.use((_req: Request, res: Response) => res.status(404).json({ error: "Not found" }));

// ── Cron ──────────────────────────────────────────────────────────────────────
// Run autonomous development loop every 3 minutes
cron.schedule("*/3 * * * *", () => {
  logger.info("[ADE] Cron: triggering development loop");
  runDevLoop();
});

// CI health sweep every 10 minutes
cron.schedule("*/10 * * * *", () => {
  logger.info("[ADE] Cron: CI sweep");
  const repos = ["ghostchain-node","ghostl-stack","ai-development"];
  triggerPipeline(repos[Math.floor(Math.random() * repos.length)]!);
});

// ── Startup ───────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info(`[ADE] Ghost Autonomous Development Engine running on :${PORT}`);
  setTimeout(runDevLoop, 500);
});
