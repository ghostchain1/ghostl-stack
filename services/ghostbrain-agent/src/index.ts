/**
 * GhostBrain Agent — Entry Point
 *
 * Runs on every physical/virtual server node.
 * Reports local metrics to ghostbrain-cluster on a configurable interval.
 *
 * Default port : 7901  (AGENT_PORT env)
 * Default bind : 127.0.0.1 (AGENT_BIND env — set 0.0.0.0 in Docker/multi-host)
 */

import { buildApp }         from "./app.js";
import { markReady }        from "./routes/status.js";
import { hydrateLocalMemory, storeLocal } from "./local_memory.js";
import { readNodeMetrics, NODE_ID }       from "./node_metrics.js";
import { collectVmInfo }    from "./vm_monitor.js";
import { collectContainerInfo } from "./docker_monitor.js";
import { request }          from "undici";

const PORT    = Number(process.env.AGENT_PORT    ?? "7901");
const BIND    = process.env.AGENT_BIND           ?? "127.0.0.1";
const CLUSTER_URL     = process.env.CLUSTER_URL  ?? "";
const MEMORY_URL      = process.env.MEMORY_URL   ?? "";
const REPORT_INTERVAL = Number(process.env.REPORT_INTERVAL_MS ?? "15000");

// ── Reporting loop ────────────────────────────────────────────────────────────

let _reportTimer: ReturnType<typeof setInterval> | null = null;

async function reportToCluster(): Promise<void> {
  if (!CLUSTER_URL) return;
  try {
    const [node, vms, containers] = await Promise.all([
      readNodeMetrics(),
      collectVmInfo(),
      collectContainerInfo(),
    ]);
    await request(`${CLUSTER_URL}/api/v1/cluster/agent-report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodeId: NODE_ID, agentUrl: `http://${BIND}:${PORT}`, node, vms, containers, ts: Date.now() }),
      bodyTimeout: 8_000,
    });

    // Also push metric snapshot event to federated memory
    if (MEMORY_URL) {
      await request(`${MEMORY_URL}/api/v1/memory/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodeId: NODE_ID,
          events: [{ type: "metric_snapshot", data: { node, vmCount: vms.length, containerCount: containers.length } }],
        }),
        bodyTimeout: 5_000,
      }).catch(() => { /* non-fatal */ });
    }

    // Check thresholds and store local events
    if (node.cpu.usagePercent > 85 || node.memory.usagePercent > 85) {
      await storeLocal({
        nodeId: NODE_ID,
        type:   "threshold_breach",
        severity: node.cpu.usagePercent > 90 || node.memory.usagePercent > 90 ? "critical" : "warn",
        data:   { cpu: node.cpu, memory: node.memory },
      });
    }
  } catch { /* network errors are non-fatal */ }
}

function startReportLoop(): void {
  readNodeMetrics().catch(() => { /* warm up CPU sample */ });
  _reportTimer = setInterval(reportToCluster, REPORT_INTERVAL);
}

function stopReportLoop(): void {
  if (_reportTimer) { clearInterval(_reportTimer); _reportTimer = null; }
}

// ── Boot ──────────────────────────────────────────────────────────────────────

const app = buildApp();

await hydrateLocalMemory();

try {
  await app.listen({ port: PORT, host: BIND });
  markReady();
  startReportLoop();
  app.log.info({ bind: BIND, port: PORT, nodeId: NODE_ID, clusterUrl: CLUSTER_URL || "(none)" }, "ghostbrain-agent started");
} catch (err) {
  app.log.error(err, "ghostbrain-agent failed to start");
  process.exit(1);
}

process.on("SIGTERM", async () => {
  app.log.info("SIGTERM received — shutting down ghostbrain-agent");
  stopReportLoop();
  await app.close();
  process.exit(0);
});
