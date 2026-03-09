/**
 * GhostBrain Infra — Routes
 *
 * GET  /api/v1/infra/status               — all hypervisors + containers + storage
 * GET  /api/v1/infra/hypervisors          — hypervisor status list
 * POST /api/v1/infra/hypervisors/poll     — force refresh hypervisor stats
 * GET  /api/v1/infra/vms                  — list VMs on a hypervisor
 * POST /api/v1/infra/vms/:id/start        — start VM
 * POST /api/v1/infra/vms/:id/stop         — stop VM
 * POST /api/v1/infra/vms/migrate          — migrate VM between hypervisors
 * GET  /api/v1/infra/containers           — list all containers across all Docker hosts
 * POST /api/v1/infra/containers/:id/restart — restart a container
 * POST /api/v1/infra/containers/migrate   — migrate container across Docker hosts
 * GET  /api/v1/infra/network              — network topology
 * POST /api/v1/infra/network/isolate      — isolate a node
 * GET  /api/v1/infra/storage              — storage status + pressure
 * POST /api/v1/infra/storage/expand       — expand a volume
 * POST /api/v1/infra/rebalance            — handle cluster rebalance signal
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { pollAllHypervisors, getHypervisorStatus, selectBestHypervisor } from "../hypervisor_controller.js";
import { listVms, startVm, stopVm, migrateVm } from "../vm_controller.js";
import { listAllContainers, restartContainer, migrateContainer } from "../docker_controller.js";
import { getNetworkTopology, isolateNode } from "../network_controller.js";
import { getStorageStatus, expandVolume } from "../storage_controller.js";

// ── Schemas ───────────────────────────────────────────────────────────────────

const VmActionSchema = z.object({
  hypervisorUrl: z.string().url(),
  vmId:          z.string().min(1),
  force:         z.boolean().optional(),
});

const VmMigrateSchema = z.object({
  srcHypervisor: z.string().url(),
  tgtHypervisor: z.string().url(),
  vmId:          z.string().min(1),
});

const ContainerRestartSchema = z.object({
  hostUrl:     z.string(),
  containerId: z.string().min(1),
});

const ContainerMigrateSchema = z.object({
  srcHostUrl:  z.string(),
  tgtHostUrl:  z.string(),
  containerId: z.string().min(1),
  image:       z.string().min(1),
});

const StorageExpandSchema = z.object({
  hypervisorUrl: z.string().url(),
  volumeName:    z.string().min(1),
  newCapacityGb: z.number().min(1).max(65536),
});

const RebalanceSchema = z.object({
  overloadedNodes: z.array(z.string()),
  clusterSummary:  z.record(z.unknown()).optional(),
  ts:              z.number(),
});

// ── Route registration ────────────────────────────────────────────────────────

export async function infraRoutes(app: FastifyInstance): Promise<void> {

  // GET /api/v1/infra/status
  app.get("/api/v1/infra/status", async (_req, reply) => {
    const [hypervisors, containers, storage] = await Promise.all([
      getHypervisorStatus(),
      listAllContainers(),
      getStorageStatus(),
    ]);
    return reply.send({ ok: true, hypervisors, containers: containers.length, storage, ts: Date.now() });
  });

  // GET /api/v1/infra/hypervisors
  app.get("/api/v1/infra/hypervisors", async (_req, reply) => {
    return reply.send({ ok: true, hypervisors: getHypervisorStatus(), best: selectBestHypervisor() });
  });

  // POST /api/v1/infra/hypervisors/poll
  app.post("/api/v1/infra/hypervisors/poll", async (_req, reply) => {
    const results = await pollAllHypervisors();
    return reply.send({ ok: true, hypervisors: results });
  });

  // GET /api/v1/infra/vms
  app.get("/api/v1/infra/vms", async (req, reply) => {
    const q  = req.query as Record<string, string>;
    const hv = q.hypervisorUrl;
    if (!hv) return reply.status(400).send({ error: "hypervisorUrl query param required" });
    const vms = await listVms(hv);
    return reply.send({ ok: true, vms });
  });

  // POST /api/v1/infra/vms/:id/start
  app.post("/api/v1/infra/vms/:id/start", async (req, reply) => {
    const p = VmActionSchema.safeParse(req.body);
    if (!p.success) return reply.status(400).send({ error: "invalid_body" });
    const result = await startVm(p.data.hypervisorUrl, p.data.vmId);
    return reply.status(result.ok ? 200 : 500).send({ ok: result.ok, result });
  });

  // POST /api/v1/infra/vms/:id/stop
  app.post("/api/v1/infra/vms/:id/stop", async (req, reply) => {
    const p = VmActionSchema.safeParse(req.body);
    if (!p.success) return reply.status(400).send({ error: "invalid_body" });
    const result = await stopVm(p.data.hypervisorUrl, p.data.vmId, p.data.force ?? false);
    return reply.status(result.ok ? 200 : 500).send({ ok: result.ok, result });
  });

  // POST /api/v1/infra/vms/migrate
  app.post("/api/v1/infra/vms/migrate", async (req, reply) => {
    const p = VmMigrateSchema.safeParse(req.body);
    if (!p.success) return reply.status(400).send({ error: "invalid_body" });
    const result = await migrateVm(p.data.srcHypervisor, p.data.tgtHypervisor, p.data.vmId);
    return reply.status(result.ok ? 200 : 500).send({ ...result });
  });

  // GET /api/v1/infra/containers
  app.get("/api/v1/infra/containers", async (_req, reply) => {
    const containers = await listAllContainers();
    return reply.send({ ok: true, containers });
  });

  // POST /api/v1/infra/containers/:id/restart
  app.post("/api/v1/infra/containers/:id/restart", async (req, reply) => {
    const p = ContainerRestartSchema.safeParse(req.body);
    if (!p.success) return reply.status(400).send({ error: "invalid_body" });
    const r = await restartContainer(p.data.hostUrl, p.data.containerId);
    return reply.status(r.ok ? 200 : 500).send({ ...r });
  });

  // POST /api/v1/infra/containers/migrate
  app.post("/api/v1/infra/containers/migrate", async (req, reply) => {
    const p = ContainerMigrateSchema.safeParse(req.body);
    if (!p.success) return reply.status(400).send({ error: "invalid_body" });
    const r = await migrateContainer(p.data.srcHostUrl, p.data.tgtHostUrl, p.data.containerId, p.data.image);
    return reply.status(r.ok ? 200 : 500).send({ ...r });
  });

  // GET /api/v1/infra/network
  app.get("/api/v1/infra/network", async (_req, reply) => {
    const topology = await getNetworkTopology();
    return reply.send({ ok: true, topology });
  });

  // POST /api/v1/infra/network/isolate
  app.post("/api/v1/infra/network/isolate", async (req, reply) => {
    const b = req.body as { agentUrl?: string };
    if (!b?.agentUrl) return reply.status(400).send({ error: "agentUrl required" });
    const r = await isolateNode(b.agentUrl);
    return reply.status(r.ok ? 200 : 500).send({ ...r });
  });

  // GET /api/v1/infra/storage
  app.get("/api/v1/infra/storage", async (_req, reply) => {
    const storage = await getStorageStatus();
    return reply.send({ ok: true, ...storage });
  });

  // POST /api/v1/infra/storage/expand
  app.post("/api/v1/infra/storage/expand", async (req, reply) => {
    const p = StorageExpandSchema.safeParse(req.body);
    if (!p.success) return reply.status(400).send({ error: "invalid_body" });
    const r = await expandVolume(p.data.hypervisorUrl, p.data.volumeName, p.data.newCapacityGb);
    return reply.status(r.ok ? 200 : 500).send({ ...r });
  });

  // POST /api/v1/infra/rebalance — receives overload signals from cluster leader
  app.post("/api/v1/infra/rebalance", async (req, reply) => {
    const p = RebalanceSchema.safeParse(req.body);
    if (!p.success) return reply.status(400).send({ error: "invalid_body" });

    const best = selectBestHypervisor();
    // Trigger poll to get fresh hypervisor state
    void pollAllHypervisors();

    app.log.warn(
      { overloadedNodes: p.data.overloadedNodes, bestHypervisor: best?.url ?? "none" },
      "rebalance signal received from cluster"
    );

    return reply.send({
      ok:              true,
      overloadedNodes: p.data.overloadedNodes,
      bestHypervisor:  best?.url ?? null,
      action:          best ? "poll_initiated" : "no_capacity",
    });
  });
}
