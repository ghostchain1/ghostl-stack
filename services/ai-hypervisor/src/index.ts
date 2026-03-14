/**
 * index.ts — GhostStack Hypervisor Control Layer (HCL)
 * Port: 9986
 * GhostBrain's interface to bare-metal hypervisor, VM fleet, Docker containers,
 * blockchain nodes, and autonomous failure recovery.
 */

import express from "express";
import cors    from "cors";
import cron    from "node-cron";

import { getVMs, getVM, getVmStats, createVM, performVmAction, getVmActionLog, tickVmTelemetry, VmRole, VmAction } from "./vm/vmManager";
import { getContainers, getContainer, getContainerStats, startContainer, performContainerAction, getContainerActionLog, tickContainerTelemetry, ContainerAction } from "./containers/containerManager";
import { getNodes, getNode, getNodeStats, deployNode, decommissionNode, getProvisionHistory, tickNodeTelemetry, ChainId, NodeRole } from "./nodes/nodeProvisioner";
import { getHostMetrics, getLatestSnapshot, getHistory, monitorInfrastructure, tickHostMetrics } from "./monitoring/infraMonitor";
import { getIncidents, getIncident, getRecoveryStats, resolveIncident, runRecoveryEngine } from "./recovery/failureRecovery";

const PORT = parseInt(process.env.PORT ?? "9986", 10);
const app  = express();
app.use(cors());
app.use(express.json());

// ── HCL Autonomous Control Loop ───────────────────────────────────────────────
let loopRunning   = false;
let loopCycles    = 0;
let lastRun:      number | null = null;
let lastError:    string | null = null;
const phaseLog:   string[] = [];

const MAX_PHASE_LOG = 20;
function logPhase(msg: string): void {
  phaseLog.unshift(`[${new Date().toISOString()}] ${msg}`);
  if (phaseLog.length > MAX_PHASE_LOG) phaseLog.length = MAX_PHASE_LOG;
}

async function runHclLoop(): Promise<void> {
  if (loopRunning) return;
  loopRunning = true;
  lastError   = null;
  try {
    // Phase 1: Telemetry tick
    tickHostMetrics();
    tickVmTelemetry();
    tickContainerTelemetry();
    tickNodeTelemetry();
    logPhase("Phase 1: Telemetry updated");

    // Phase 2: Infrastructure snapshot
    const snap = monitorInfrastructure();
    logPhase(`Phase 2: Infra snapshot — health ${snap.health} (${snap.healthScore}/100) alerts=${snap.alerts.length}`);

    // Phase 3: Failure detection + recovery
    const recovery = await runRecoveryEngine();
    logPhase(`Phase 3: Recovery — detected=${recovery.incidentsDetected} actions=${recovery.actionsTriggered}`);

    // Phase 4: Resource rebalance signal (logged only)
    const vmSt  = getVmStats();
    const ctrSt = getContainerStats();
    logPhase(`Phase 4: Resources — VMs=${vmSt.running}/${vmSt.total} containers=${ctrSt.running}/${ctrSt.total}`);

    loopCycles++;
    lastRun = Date.now();
    logPhase(`Phase 5: Cycle ${loopCycles} complete`);
  } catch (err) {
    lastError = String(err);
    logPhase(`ERROR: ${lastError}`);
  } finally {
    loopRunning = false;
  }
}

// Run loop every 5 minutes + heartbeat tick every minute
cron.schedule("*/5 * * * *", runHclLoop);
cron.schedule("* * * * *", () => {
  tickHostMetrics();
  tickVmTelemetry();
  tickContainerTelemetry();
  tickNodeTelemetry();
});

// ── Health & Status ───────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  const snap = getLatestSnapshot();
  res.json({
    status:  "ok",
    service: "GhostStackHypervisorControlLayer",
    port:    PORT,
    loop:    { running: loopRunning, cycles: loopCycles, lastRun },
    infra: {
      health: snap?.health ?? "unknown",
      healthScore: snap?.healthScore ?? 0,
      alerts: snap?.alerts.length ?? 0,
    },
  });
});

app.get("/summary", (_req, res) => {
  const snap    = getLatestSnapshot();
  const vmSt    = getVmStats();
  const ctrSt   = getContainerStats();
  const nodeSt  = getNodeStats();
  const recSt   = getRecoveryStats();
  res.json({
    vms:        vmSt,
    containers: ctrSt,
    nodes:      nodeSt,
    recovery:   recSt,
    host:       getHostMetrics(),
    snapshot:   snap,
  });
});

app.get("/loop/status", (_req, res) => {
  res.json({ running: loopRunning, cycleCount: loopCycles, lastRun, lastError, phaseLog });
});

app.post("/loop/run", async (_req, res) => {
  await runHclLoop();
  res.json({ triggered: true, cycleCount: loopCycles, lastRun });
});

// ── VMs ───────────────────────────────────────────────────────────────────────
app.get("/vms", (req, res) => {
  const { role, state } = req.query as Record<string, string | undefined>;
  res.json(getVMs(role as VmRole | undefined, state as never));
});

app.get("/vms/stats", (_req, res) => res.json(getVmStats()));
app.get("/vms/actions", (_req, res) => res.json(getVmActionLog()));

app.get("/vms/:id", (req, res) => {
  const vm = getVM(req.params.id);
  if (!vm) return res.status(404).json({ error: "VM not found" });
  res.json(vm);
});

app.post("/vms", async (req, res) => {
  const { name, role, cpuCores, ramGB, diskGB } = req.body as {
    name: string; role: VmRole; cpuCores: number; ramGB: number; diskGB: number;
  };
  if (!name || !role || !cpuCores || !ramGB || !diskGB) {
    return res.status(400).json({ error: "name, role, cpuCores, ramGB, diskGB required" });
  }
  const vm = await createVM(name, role, cpuCores, ramGB, diskGB);
  res.status(201).json(vm);
});

app.post("/vms/:id/actions", async (req, res) => {
  const { action } = req.body as { action: VmAction };
  if (!action) return res.status(400).json({ error: "action required" });
  const result = await performVmAction(req.params.id, action);
  res.json(result);
});

// ── Containers ────────────────────────────────────────────────────────────────
app.get("/containers", (req, res) => {
  const { stack, state } = req.query as Record<string, string | undefined>;
  res.json(getContainers(stack, state as never));
});

app.get("/containers/stats", (_req, res) => res.json(getContainerStats()));
app.get("/containers/actions", (_req, res) => res.json(getContainerActionLog()));

app.get("/containers/:id", (req, res) => {
  const ctr = getContainer(req.params.id);
  if (!ctr) return res.status(404).json({ error: "Container not found" });
  res.json(ctr);
});

app.post("/containers", async (req, res) => {
  const { name, image, stack, port } = req.body as { name: string; image: string; stack: string; port?: number };
  if (!name || !image || !stack) return res.status(400).json({ error: "name, image, stack required" });
  const ctr = await startContainer(name, image, stack, port ?? null);
  res.status(201).json(ctr);
});

app.post("/containers/:id/actions", async (req, res) => {
  const { action } = req.body as { action: ContainerAction };
  if (!action) return res.status(400).json({ error: "action required" });
  const result = await performContainerAction(req.params.id, action);
  res.json(result);
});

// ── Nodes ─────────────────────────────────────────────────────────────────────
app.get("/nodes", (req, res) => {
  const { chain, role, state } = req.query as Record<string, string | undefined>;
  res.json(getNodes(chain as ChainId | undefined, role as NodeRole | undefined, state as never));
});

app.get("/nodes/stats", (_req, res) => res.json(getNodeStats()));
app.get("/nodes/history", (_req, res) => res.json(getProvisionHistory()));

app.get("/nodes/:id", (req, res) => {
  const node = getNode(req.params.id);
  if (!node) return res.status(404).json({ error: "Node not found" });
  res.json(node);
});

app.post("/nodes/deploy", async (req, res) => {
  const { chain, role, vmId } = req.body as { chain: ChainId; role: NodeRole; vmId?: string };
  if (!chain || !role) return res.status(400).json({ error: "chain and role required" });
  const result = await deployNode({ chain, role, vmId });
  res.status(201).json(result);
});

app.delete("/nodes/:id", async (req, res) => {
  const result = await decommissionNode(req.params.id);
  res.json(result);
});

// ── Monitoring ────────────────────────────────────────────────────────────────
app.get("/monitoring/host", (_req, res) => res.json(getHostMetrics()));

app.get("/monitoring/latest", (_req, res) => {
  const snap = getLatestSnapshot() ?? monitorInfrastructure();
  res.json(snap);
});

app.get("/monitoring/history", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string ?? "60", 10), 200);
  res.json(getHistory(limit));
});

app.post("/monitoring/snapshot", (_req, res) => {
  const snap = monitorInfrastructure();
  res.json(snap);
});

// ── Recovery ──────────────────────────────────────────────────────────────────
app.get("/recovery/incidents", (req, res) => {
  const { status } = req.query as Record<string, string | undefined>;
  res.json(getIncidents(status as never));
});

app.get("/recovery/stats", (_req, res) => res.json(getRecoveryStats()));

app.get("/recovery/incidents/:id", (req, res) => {
  const inc = getIncident(req.params.id);
  if (!inc) return res.status(404).json({ error: "Incident not found" });
  res.json(inc);
});

app.post("/recovery/incidents/:id/resolve", async (req, res) => {
  const result = await resolveIncident(req.params.id, "manual");
  res.json(result);
});

app.post("/recovery/run", async (_req, res) => {
  const result = await runRecoveryEngine();
  res.json(result);
});

// ── Bootstrap ────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[HCL] GhostStack Hypervisor Control Layer listening on :${PORT}`);
  runHclLoop();
});
