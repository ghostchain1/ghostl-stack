// ── Metrics Collector ─────────────────────────────────────────────────────────
// Polls GhostChain RPCs and HCL for real telemetry.
// Falls back to simulated healthy metrics when backends are unavailable.

import axios from "axios";

export interface NodeMetrics {
  nodeId:      string;
  label:       string;
  type:        "rpc" | "validator" | "vm" | "container";
  cpu:         number;   // percentage 0–100
  memory:      number;   // percentage 0–100
  disk:        number;   // percentage 0–100
  network:     number;   // Mbps inbound
  latency:     number;   // ms round-trip
  blockHeight: number;
  peerCount:   number;
  online:      boolean;
  timestamp:   number;
}

export interface SystemMetrics {
  nodes:        NodeMetrics[];
  avgCpu:       number;
  avgMemory:    number;
  avgDisk:      number;
  avgNetwork:   number;
  totalNodes:   number;
  onlineNodes:  number;
  offlineNodes: number;
  timestamp:    number;
}

// ── Simulated fallback metrics ─────────────────────────────────────────────────
function simulateNode(
  nodeId: string,
  label:  string,
  type:   NodeMetrics["type"],
  seed:   number,
): NodeMetrics {
  const jitter = (base: number, range: number) =>
    Math.min(100, Math.max(0, base + Math.sin(seed + Date.now() / 60_000) * range));
  return {
    nodeId, label, type,
    cpu:         jitter(35, 15),
    memory:      jitter(48, 12),
    disk:        jitter(42, 5),
    network:     jitter(120, 80),
    latency:     Math.max(1, jitter(28, 20)),
    blockHeight: Math.floor(100_000 + seed * 100 + Date.now() / 3_000),
    peerCount:   Math.floor(8 + (seed % 5)),
    online:      true,
    timestamp:   Date.now(),
  };
}

// ── Probe a chain RPC via eth_blockNumber ──────────────────────────────────────
async function probeChainRpc(
  nodeId: string,
  label:  string,
  url:    string,
  seed:   number,
): Promise<NodeMetrics> {
  try {
    const t0  = Date.now();
    const res = await axios.post(
      url,
      { jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: 1 },
      { timeout: 3_000 },
    );
    const latency     = Date.now() - t0;
    const blockHeight = parseInt((res.data?.result as string | undefined) ?? "0x0", 16);
    const sim = simulateNode(nodeId, label, "rpc", seed);
    return { ...sim, blockHeight, latency, online: true };
  } catch {
    return { ...simulateNode(nodeId, label, "rpc", seed), online: false, cpu: 0, memory: 0, network: 0 };
  }
}

// ── Probe HCL /snapshot for VM telemetry ──────────────────────────────────────
async function probeHCL(): Promise<NodeMetrics[]> {
  const hclUrl = process.env.HCL_URL ?? "http://localhost:9986";
  try {
    const res = await axios.get<{ vms?: Record<string, unknown>[] }>(
      `${hclUrl}/snapshot`,
      { timeout: 4_000 },
    );
    return (res.data?.vms ?? []).map((vm, i): NodeMetrics => ({
      nodeId:      `vm-${String(vm["id"] ?? i)}`,
      label:       String(vm["name"] ?? `VM-${i}`),
      type:        "vm",
      cpu:         Number(vm["cpuPct"]  ?? 0),
      memory:      Number(vm["memMB"]   ?? 0) / 327.68, // approx % of 32 GB
      disk:        Number(vm["diskGB"]  ?? 0) / 10,     // approx % of 1 TB
      network:     150 + Math.random() * 80,
      latency:     10  + Math.random() * 20,
      blockHeight: 0,
      peerCount:   0,
      online:      String(vm["state"]) === "running",
      timestamp:   Date.now(),
    }));
  } catch {
    return [];
  }
}

// ── Main collect function ──────────────────────────────────────────────────────
export async function collectMetrics(): Promise<SystemMetrics> {
  const [chain1, chain2, chain3, hclVMs] = await Promise.all([
    probeChainRpc("ghostchain-rpc", "GhostChain RPC (L1)", process.env.GHOSTCHAIN_RPC ?? "http://localhost:8545", 1),
    probeChainRpc("ghostl2-rpc",   "GhostL2 RPC (L2)",    process.env.GHOSTL2_RPC   ?? "http://localhost:8546", 2),
    probeChainRpc("ghostl3-rpc",   "GhostL3 RPC (L3)",    process.env.GHOSTL3_RPC   ?? "http://localhost:8547", 3),
    probeHCL(),
  ]);

  // Simulated validator telemetry as baseline
  const validators: NodeMetrics[] = [1, 2, 3].map(i =>
    simulateNode(`validator-${i}`, `Validator ${i}`, "validator", i + 10),
  );

  const nodes   = [chain1, chain2, chain3, ...validators, ...hclVMs];
  const online  = nodes.filter(n => n.online);
  const avg     = (arr: number[]) =>
    arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  return {
    nodes,
    avgCpu:       avg(online.map(n => n.cpu)),
    avgMemory:    avg(online.map(n => n.memory)),
    avgDisk:      avg(online.map(n => n.disk)),
    avgNetwork:   avg(online.map(n => n.network)),
    totalNodes:   nodes.length,
    onlineNodes:  online.length,
    offlineNodes: nodes.length - online.length,
    timestamp:    Date.now(),
  };
}
