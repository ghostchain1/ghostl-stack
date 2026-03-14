/**
 * Ghost Autonomous Infrastructure Engine (AIE) — port 9975
 *
 * Orchestrates all infrastructure sub-systems:
 *   • System health monitor (every 30 s)
 *   • Docker container supervisor (every 60 s)
 *   • Service auto-repair (every 2 min)
 *   • Resource balancer (every 5 min)
 *   • Node scaler (every 15 min)
 *   • VM audit (every 1 h)
 */

import "dotenv/config";
import express from "express";
import cron from "node-cron";
import logger from "./utils/logger";
import { checkSystemHealth, getHealthHistory, getLatestHealth } from "./monitor/systemHealth";
import { checkContainers, getRestartLog, getLastContainerList, getContainerSummary } from "./containers/dockerSupervisor";
import { initRegistry, runRepairCycle, getRepairLog, getRegisteredServices } from "./repair/autoRepair";
import { scaleNodes, getScalingLog } from "./scaling/nodeScaler";
import { listVMs, createVM, startVM, stopVM, getProvisionLog } from "./vm/vmProvisioner";
import { balanceResources, getBalanceHistory, getLatestBalance } from "./balancing/resourceBalancer";

const PORT = Number(process.env.PORT ?? 9975);
const app  = express();
app.use(express.json());

const startTime = Date.now();

// ── Health ─────────────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({
    status:  "ok",
    service: "ai-infrastructure",
    port:    PORT,
    uptime:  Math.floor((Date.now() - startTime) / 1000),
    version: "1.0.0",
  });
});

// ── System health ─────────────────────────────────────────────────────────────

app.get("/system/health", async (_req, res) => {
  try {
    const snap = await checkSystemHealth();
    res.json(snap);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/system/history", (_req, res) => {
  res.json(getHealthHistory());
});

// ── Containers ────────────────────────────────────────────────────────────────

app.get("/containers", (_req, res) => {
  res.json({ containers: getLastContainerList(), summary: getContainerSummary() });
});

app.get("/containers/restart-log", (_req, res) => {
  res.json(getRestartLog());
});

app.post("/containers/check", async (_req, res) => {
  const containers = await checkContainers();
  res.json({ containers, summary: getContainerSummary() });
});

// ── Repair ────────────────────────────────────────────────────────────────────

app.get("/repair/log", (_req, res) => res.json(getRepairLog()));
app.get("/repair/services", (_req, res) => res.json(getRegisteredServices()));
app.post("/repair/run", async (_req, res) => {
  const events = await runRepairCycle();
  res.json({ events, count: events.length });
});

// ── Scaling ───────────────────────────────────────────────────────────────────

app.get("/scaling/log", (_req, res) => res.json(getScalingLog()));
app.post("/scaling/run", async (_req, res) => {
  const decisions = await scaleNodes();
  res.json({ decisions, count: decisions.length });
});

// ── VMs ───────────────────────────────────────────────────────────────────────

app.get("/vms", async (_req, res) => {
  const vms = await listVMs();
  res.json({ vms, count: vms.length });
});

app.post("/vms/create", async (req, res) => {
  const { name, memoryMB = 4096, vcpus = 4, diskGB = 50, osVariant, network } = req.body as {
    name?: unknown; memoryMB?: unknown; vcpus?: unknown; diskGB?: unknown;
    osVariant?: unknown; network?: unknown;
  };

  if (typeof name !== "string") {
    res.status(400).json({ error: "name (string) required" });
    return;
  }
  const event = await createVM({
    name,
    memoryMB: typeof memoryMB === "number" ? memoryMB : 4096,
    vcpus:    typeof vcpus    === "number" ? vcpus    : 4,
    diskGB:   typeof diskGB   === "number" ? diskGB   : 50,
    osVariant: typeof osVariant === "string" ? osVariant : undefined,
    network:   typeof network   === "string" ? network   : undefined,
  });
  res.status(event.success ? 200 : 500).json(event);
});

app.post("/vms/:name/start", async (req, res) => {
  const event = await startVM(req.params.name ?? "");
  res.status(event.success ? 200 : 500).json(event);
});

app.post("/vms/:name/stop", async (req, res) => {
  const event = await stopVM(req.params.name ?? "");
  res.status(event.success ? 200 : 500).json(event);
});

app.get("/vms/provision-log", (_req, res) => res.json(getProvisionLog()));

// ── Resource balancer ─────────────────────────────────────────────────────────

app.get("/balance/status", (_req, res) => {
  res.json(getLatestBalance() ?? { status: "no data yet" });
});

app.get("/balance/history", (_req, res) => res.json(getBalanceHistory()));
app.post("/balance/run", async (_req, res) => {
  const snap = await balanceResources();
  res.json(snap);
});

// ── Summary ───────────────────────────────────────────────────────────────────

app.get("/summary", async (_req, res) => {
  const latestHealth  = getLatestHealth();
  const containerSum  = getContainerSummary();
  const latestBalance = getLatestBalance();
  const vms           = await listVMs();

  res.json({
    system: {
      status:     latestHealth?.status     ?? "unknown",
      cpuPercent: latestHealth?.cpu.usagePercent ?? 0,
      memPercent: latestHealth?.memory.usedPercent ?? 0,
      issues:     latestHealth?.issues ?? [],
    },
    containers: containerSum,
    vms: { total: vms.length, running: vms.filter((v) => v.state === "running").length },
    balance: { action: latestBalance?.action ?? "unknown", cpuPercent: latestBalance?.cpuPercent ?? 0 },
    repair:  { totalEvents: getRepairLog().length },
    scaling: { totalDecisions: getScalingLog().length },
  });
});

// ── Autonomous cron loops ─────────────────────────────────────────────────────

// Every 30 s — system health snapshot
cron.schedule("*/30 * * * * *", async () => {
  const snap = await checkSystemHealth();
  if (snap.status !== "healthy") {
    logger.warn("[AIE] Health check: issues detected", { status: snap.status, issues: snap.issues });
  }
});

// Every 60 s — container supervisor
cron.schedule("*/60 * * * * *", async () => {
  await checkContainers();
});

// Every 2 min — auto-repair cycle
cron.schedule("*/2 * * * *", async () => {
  const events = await runRepairCycle();
  if (events.length > 0) {
    logger.info(`[AIE] Repair cycle: ${events.length} action(s)`);
  }
});

// Every 5 min — resource balancer
cron.schedule("*/5 * * * *", async () => {
  const snap = await balanceResources();
  if (snap.action !== "hold") {
    logger.warn("[AIE] Resource imbalance", { action: snap.action, reason: snap.reason });
  }
});

// Every 15 min — node scaler
cron.schedule("*/15 * * * *", async () => {
  const decisions = await scaleNodes();
  if (decisions.length > 0) {
    logger.info(`[AIE] Scaling decisions: ${decisions.length}`);
  }
});

// Every hour — VM audit
cron.schedule("0 * * * *", async () => {
  const vms = await listVMs();
  logger.info(`[AIE] VM audit: ${vms.length} VMs found, ${vms.filter((v) => v.state === "running").length} running`);
});

// ── Boot ──────────────────────────────────────────────────────────────────────

app.listen(PORT, async () => {
  logger.info(`[AIE] Ghost Autonomous Infrastructure Engine running on port ${PORT}`);

  // Initialise repair registry
  initRegistry();

  // Run initial health check
  const snap = await checkSystemHealth();
  logger.info("[AIE] Initial health", {
    status: snap.status,
    cpu:    snap.cpu.usagePercent,
    mem:    snap.memory.usedPercent,
  });

  // Initial container check
  await checkContainers();
});
