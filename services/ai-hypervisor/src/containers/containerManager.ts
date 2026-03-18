/**
 * containerManager.ts — GhostStack Hypervisor Control Layer
 * Manages Docker container lifecycle across all GhostStack stacks.
 */

import { v4 as uuid } from "uuid";

export type ContainerState  = "running" | "stopped" | "restarting" | "exited" | "errored" | "pulling";
export type ContainerAction = "start" | "stop" | "restart" | "remove";

export interface GhostContainer {
  id:          string;
  name:        string;
  image:       string;
  stack:       string;
  state:       ContainerState;
  port:        number | null;
  restarts:    number;
  cpuPct:      number;
  memMB:       number;
  exitCode?:   number;
  uptime:      number;   // seconds
  startedAt:   number;
  lastEvent:   number;
}

export interface ContainerActionResult {
  containerId: string;
  name:        string;
  action:      ContainerAction;
  status:      "accepted" | "failed";
  message:     string;
  at:          number;
}

// ── Seeded service containers ─────────────────────────────────────────────────
const SEED: Array<Omit<GhostContainer, "cpuPct" | "memMB" | "uptime" | "lastEvent">> = [
  // Chain validators
  { id: "ctr-gc-boot",  name: "ghostchain-bootnode",    image: "ghostl/geth:alltools-v1.13.14",     stack: "ghostvalidators",         state: "running", port: 30305, restarts: 0, startedAt: Date.now() - 86400000 * 60 },
  { id: "ctr-gc-val1",  name: "ghostchain-validator-1", image: "ghostl/geth:alltools-v1.13.14",     stack: "ghostvalidators",         state: "running", port: 8545,  restarts: 0, startedAt: Date.now() - 86400000 * 60 },
  { id: "ctr-gc-val2",  name: "ghostchain-validator-2", image: "ghostl/geth:alltools-v1.13.14",     stack: "ghostvalidators",         state: "running", port: 8645,  restarts: 1, startedAt: Date.now() - 86400000 * 30 },
  { id: "ctr-gc-val3",  name: "ghostchain-validator-3", image: "ghostl/geth:alltools-v1.13.14",     stack: "ghostvalidators",         state: "running", port: 8745,  restarts: 0, startedAt: Date.now() - 86400000 * 14 },
  { id: "ctr-gc-val4",  name: "ghostchain-validator-4", image: "ghostl/geth:alltools-v1.13.14",     stack: "ghostvalidators",         state: "stopped", port: 8845,  restarts: 3, exitCode: 1, startedAt: Date.now() - 86400000 * 7 },
  // GhostBrain
  { id: "ctr-gb-swarm", name: "ghostbrain-swarm",       image: "ghoststack-ghostbrain-swarm:latest", stack: "ghostbrain",              state: "running", port: 9000,  restarts: 0, startedAt: Date.now() - 86400000 * 90 },
  { id: "ctr-gb-kern",  name: "ghostbrain-kernel",      image: "ghoststack-ghostbrain-kernel:latest",stack: "ghostbrain",              state: "running", port: 9300,  restarts: 0, startedAt: Date.now() - 86400000 * 90 },
  { id: "ctr-gb-cp",    name: "ghostbrain-control",     image: "ghoststack-ghostbrain-control:latest",stack:"ghostbrain",             state: "running", port: 9500,  restarts: 0, startedAt: Date.now() - 86400000 * 90 },
  { id: "ctr-gb-ee",    name: "ghostbrain-economy",     image: "ghoststack-ghostbrain-economy:latest",stack:"ghostbrain",             state: "running", port: 9800,  restarts: 0, startedAt: Date.now() - 86400000 * 90 },
  // Data mesh
  { id: "ctr-redis",    name: "ghostmesh-redis",        image: "redis:7-alpine",                     stack: "ghostdatamesh",           state: "running", port: 6379,  restarts: 0, startedAt: Date.now() - 86400000 * 90 },
  { id: "ctr-pg",       name: "ghostmesh-postgres",     image: "postgres:16-alpine",                 stack: "ghostdatamesh",           state: "running", port: 5432,  restarts: 0, startedAt: Date.now() - 86400000 * 90 },
  // Monitoring
  { id: "ctr-prom",     name: "ghost-prometheus",       image: "prom/prometheus:latest",             stack: "ghostmonitoring",         state: "running", port: 9090,  restarts: 0, startedAt: Date.now() - 86400000 * 60 },
  { id: "ctr-graf",     name: "ghost-grafana",          image: "grafana/grafana:latest",             stack: "ghostmonitoring",         state: "running", port: 3001,  restarts: 0, startedAt: Date.now() - 86400000 * 60 },
  // AI engines (representative subset)
  { id: "ctr-aims",     name: "ai-marketing",           image: "ghoststack-ai-marketing:latest",     stack: "ghoststack-ai-marketing", state: "running", port: 9970,  restarts: 0, startedAt: Date.now() - 86400000 * 14 },
  { id: "ctr-vge",      name: "ai-growth",              image: "ghoststack-ai-growth:latest",        stack: "ghoststack-ai-marketing", state: "running", port: 9971,  restarts: 0, startedAt: Date.now() - 86400000 * 14 },
  { id: "ctr-ase",      name: "ai-security",            image: "ghoststack-ai-security:latest",      stack: "ghoststack-ai-marketing", state: "running", port: 9976,  restarts: 1, startedAt: Date.now() - 86400000 * 10 },
  { id: "ctr-gie",      name: "ai-intelligence",        image: "ghoststack-ai-intelligence:latest",  stack: "ghoststack-ai-marketing", state: "running", port: 9977,  restarts: 0, startedAt: Date.now() - 86400000 * 10 },
  { id: "ctr-ine",      name: "ai-interplanetary",      image: "ghoststack-ai-interplanetary:latest",stack: "ghoststack-ai-marketing", state: "running", port: 9985,  restarts: 0, startedAt: Date.now() - 86400000 * 5 },
  { id: "ctr-hcl",      name: "ai-hypervisor",          image: "ghoststack-ai-hypervisor:latest",    stack: "ghoststack-ai-marketing", state: "running", port: 9986,  restarts: 0, startedAt: Date.now() },
];

const containers: Map<string, GhostContainer> = new Map(
  SEED.map((s) => [
    s.id,
    {
      ...s,
      cpuPct:    s.state === "running" ? 5 + Math.random() * 25 : 0,
      memMB:     s.state === "running" ? 64 + Math.random() * 512 : 0,
      uptime:    s.state === "running" ? Math.floor((Date.now() - s.startedAt) / 1000) : 0,
      lastEvent: Date.now(),
    },
  ])
);

const actionLog: ContainerActionResult[] = [];

// ── Exports ───────────────────────────────────────────────────────────────────

export function getContainers(stack?: string, state?: ContainerState): GhostContainer[] {
  return [...containers.values()].filter(
    (c) => (!stack || c.stack === stack) && (!state || c.state === state)
  );
}

export function getContainer(id: string): GhostContainer | undefined {
  return containers.get(id);
}

export function getContainerStats() {
  const all = [...containers.values()];
  const stacks = [...new Set(all.map((c) => c.stack))];
  return {
    total:       all.length,
    running:     all.filter((c) => c.state === "running").length,
    stopped:     all.filter((c) => c.state === "stopped").length,
    restarting:  all.filter((c) => c.state === "restarting").length,
    errored:     all.filter((c) => c.state === "errored").length,
    totalRestarts: all.reduce((s, c) => s + c.restarts, 0),
    avgCpuPct:   all.filter((c) => c.state === "running").reduce((s, c) => s + c.cpuPct, 0) /
                 (all.filter((c) => c.state === "running").length || 1),
    totalMemMB:  all.filter((c) => c.state === "running").reduce((s, c) => s + c.memMB, 0),
    stacks,
    byStack: Object.fromEntries(
      stacks.map((st) => [
        st,
        { total: all.filter((c) => c.stack === st).length, running: all.filter((c) => c.stack === st && c.state === "running").length },
      ])
    ),
  };
}

export async function startContainer(name: string, image: string, stack: string, port: number | null): Promise<GhostContainer> {
  // Check if container already exists by name
  const existing = [...containers.values()].find((c) => c.name === name);
  if (existing) {
    existing.state     = "running";
    existing.lastEvent = Date.now();
    return existing;
  }
  const id  = `ctr-${uuid().slice(0, 8)}`;
  const ctr: GhostContainer = {
    id, name, image, stack, state: "pulling", port,
    restarts: 0, cpuPct: 0, memMB: 0, uptime: 0,
    startedAt: Date.now(), lastEvent: Date.now(),
  };
  containers.set(id, ctr);
  setTimeout(() => { ctr.state = "running"; ctr.cpuPct = 8; ctr.memMB = 128; }, 2000);
  return ctr;
}

export async function performContainerAction(id: string, action: ContainerAction): Promise<ContainerActionResult> {
  const ctr = containers.get(id);
  if (!ctr) {
    const r: ContainerActionResult = { containerId: id, name: id, action, status: "failed", message: "Container not found", at: Date.now() };
    actionLog.push(r);
    return r;
  }
  switch (action) {
    case "start":
      ctr.state = "running"; ctr.cpuPct = 8; ctr.memMB = 128;
      break;
    case "stop":
      ctr.state = "stopped"; ctr.cpuPct = 0; ctr.memMB = 0;
      break;
    case "restart":
      ctr.state = "restarting"; ctr.restarts++;
      setTimeout(() => { ctr.state = "running"; ctr.cpuPct = 10; ctr.memMB = 148; }, 2000);
      break;
    case "remove":
      containers.delete(id);
      break;
  }
  ctr.lastEvent = Date.now();
  const r: ContainerActionResult = {
    containerId: id, name: ctr.name, action, status: "accepted",
    message: `Container ${action} accepted`, at: Date.now(),
  };
  actionLog.push(r);
  return r;
}

export function getContainerActionLog(): ContainerActionResult[] {
  return actionLog.slice(-100);
}

export function tickContainerTelemetry(): void {
  for (const c of containers.values()) {
    if (c.state !== "running") continue;
    c.uptime  += 60;
    c.cpuPct   = Math.max(1, Math.min(90, c.cpuPct + (Math.random() - 0.48) * 5));
    c.memMB    = Math.max(32, Math.min(2048, c.memMB + (Math.random() - 0.47) * 20));
    c.lastEvent = Date.now();
  }
}
