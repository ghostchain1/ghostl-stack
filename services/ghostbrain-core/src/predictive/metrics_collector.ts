/**
 * GhostBrain Predictive AI — Metrics Collector
 *
 * Collects live infrastructure metrics from multiple sources:
 *   - OS-level (CPU, RAM) via node:os
 *   - Docker containers via Docker Engine API (unix socket)
 *   - node_exporter Prometheus endpoint (if available)
 *   - GhostChain L1 / L2 / L3 RPC (gas price, block rate)
 *
 * Enforces the canonical L3 → L2 → L1 routing: L3 metrics are
 * collected independently; they never bypass the L2 gateway.
 *
 * No external npm dependencies — only node: built-ins + undici (already
 * present in the ghostbrain-core package).
 */

import os                   from "node:os";
import { exec }             from "node:child_process";
import { promisify }        from "node:util";
import { request }          from "undici";
import { resolveRpcEndpoint, rpcBlockNumber, rpcGasPrice } from "../rpc/compat.js";

const execAsync = promisify(exec);

// ── Config ────────────────────────────────────────────────────────────────────

const DOCKER_SOCKET    = process.env.DOCKER_SOCKET        ?? "/var/run/docker.sock";
const NODE_EXPORTER    = process.env.NODE_EXPORTER_URL    ?? "http://localhost:9100/metrics";
const L1_RPC           = resolveRpcEndpoint(["GHOSTCHAIN_L1_RPC"], ["GHOST_L1_RPC_URLS"], "http://localhost:18545");
const L2_RPC           = resolveRpcEndpoint(["GHOSTCHAIN_L2_RPC"], ["GHOST_L2_RPC_URLS"], "http://localhost:29547");
const L3_RPC           = resolveRpcEndpoint(["GHOSTCHAIN_L3_RPC"], ["GHOST_L3_RPC_URLS"], "http://localhost:39545");
const COLLECT_TIMEOUT  = Number(process.env.COLLECT_TIMEOUT_MS ?? "3000");

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HostSnapshot {
  timestamp:    number;
  cpuLoad1m:    number;   // os.loadavg()[0]
  cpuLoad5m:    number;
  cpuCount:     number;
  memTotal:     number;   // bytes
  memFree:      number;
  memUsagePct:  number;   // 0–100
  swapTotal:    number;
  swapFree:     number;
  swapUsagePct: number;
  diskIoMs?:    number;   // from node_exporter (if available)
  netRxBytes?:  number;
  netTxBytes?:  number;
}

export interface ContainerSnapshot {
  id:          string;
  name:        string;
  cpuPct:      number;
  memUsage:    number;  // bytes
  memLimit:    number;
  memPct:      number;
  netRx:       number;
  netTx:       number;
  blockRead:   number;
  blockWrite:  number;
  pids:        number;
  status:      string;
}

export interface ChainSnapshot {
  chain:       "l1" | "l2" | "l3";
  chainId:     number;
  rpc:         string;
  blockNumber: number;
  gasPrice:    bigint;
  alive:       boolean;
}

export interface InfraSnapshot {
  host:       HostSnapshot;
  containers: ContainerSnapshot[];
  chains:     ChainSnapshot[];
  collectedAt: number;
}

// ── OS metrics ────────────────────────────────────────────────────────────────

export function collectHostSnapshot(): HostSnapshot {
  const [load1, load5] = os.loadavg();
  const memTotal = os.totalmem();
  const memFree  = os.freemem();
  const swapTotal = 0; // populated from node_exporter when available
  const swapFree  = 0;

  return {
    timestamp:    Date.now(),
    cpuLoad1m:    load1,
    cpuLoad5m:    load5,
    cpuCount:     os.cpus().length,
    memTotal,
    memFree,
    memUsagePct:  100 * (1 - memFree / memTotal),
    swapTotal,
    swapFree,
    swapUsagePct: 0,
  };
}

// ── Docker metrics ────────────────────────────────────────────────────────────

/** Parse `docker stats --no-stream --format json` output lines. */
async function collectDockerStats(): Promise<ContainerSnapshot[]> {
  try {
    const { stdout } = await execAsync(
      `docker stats --no-stream --format '{"id":"{{.ID}}","name":"{{.Name}}","cpu":"{{.CPUPerc}}","memUsage":"{{.MemUsage}}","memPct":"{{.MemPerc}}","netIO":"{{.NetIO}}","blockIO":"{{.BlockIO}}","pids":"{{.PIDs}}"}' 2>/dev/null`,
      { timeout: COLLECT_TIMEOUT },
    );

    return stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line): ContainerSnapshot | null => {
        try {
          const raw = JSON.parse(line) as Record<string, string>;

          const parsePct = (s: string) => parseFloat(s.replace("%", "")) || 0;
          const parseBytes = (s: string): number => {
            const m = s.match(/([\d.]+)\s*(B|kB|MiB|GiB|MB|GB|KB)/i);
            if (!m) return 0;
            const v = parseFloat(m[1]);
            switch (m[2].toLowerCase()) {
              case "kb":  return v * 1_000;
              case "mib": return v * 1_048_576;
              case "mb":  return v * 1_000_000;
              case "gib": return v * 1_073_741_824;
              case "gb":  return v * 1_000_000_000;
              default:    return v;
            }
          };

          const [memUsageStr, memLimitStr] = (raw["memUsage"] ?? "0B / 0B").split(" / ");
          const [netRxStr, netTxStr]       = (raw["netIO"]    ?? "0B / 0B").split(" / ");
          const [blkRStr, blkWStr]         = (raw["blockIO"]  ?? "0B / 0B").split(" / ");

          return {
            id:         raw["id"]   ?? "",
            name:       raw["name"] ?? "",
            cpuPct:     parsePct(raw["cpu"] ?? "0"),
            memUsage:   parseBytes(memUsageStr ?? "0B"),
            memLimit:   parseBytes(memLimitStr ?? "0B"),
            memPct:     parsePct(raw["memPct"] ?? "0"),
            netRx:      parseBytes(netRxStr ?? "0B"),
            netTx:      parseBytes(netTxStr ?? "0B"),
            blockRead:  parseBytes(blkRStr  ?? "0B"),
            blockWrite: parseBytes(blkWStr  ?? "0B"),
            pids:       parseInt(raw["pids"] ?? "0"),
            status:     "running",
          };
        } catch {
          return null;
        }
      })
      .filter((c): c is ContainerSnapshot => c !== null);
  } catch {
    return [];
  }
}

// ── node_exporter scrape ──────────────────────────────────────────────────────

/** Scrape a single gauge value from a Prometheus text exposition. */
function scrapeGauge(text: string, name: string): number | undefined {
  const re = new RegExp(`^${name}\\s+([\\d.e+\\-]+)`, "m");
  const m  = text.match(re);
  return m ? parseFloat(m[1]) : undefined;
}

async function scrapeNodeExporter(): Promise<Partial<HostSnapshot>> {
  try {
    const res = await request(NODE_EXPORTER, { bodyTimeout: COLLECT_TIMEOUT });
    if (res.statusCode !== 200) return {};
    const text = await res.body.text();

    return {
      diskIoMs:   scrapeGauge(text, "node_disk_io_time_seconds_total"),
      netRxBytes: scrapeGauge(text, "node_network_receive_bytes_total"),
      netTxBytes: scrapeGauge(text, "node_network_transmit_bytes_total"),
      swapTotal:  scrapeGauge(text, "node_memory_SwapTotal_bytes"),
      swapFree:   scrapeGauge(text, "node_memory_SwapFree_bytes"),
    };
  } catch {
    return {};
  }
}

// ── Chain RPC probes ──────────────────────────────────────────────────────────

async function probeChain(
  chain: "l1" | "l2" | "l3",
  chainId: number,
  rpc: string,
): Promise<ChainSnapshot> {
  const base: ChainSnapshot = { chain, chainId, rpc, blockNumber: 0, gasPrice: 0n, alive: false };
  try {
    const block = await rpcBlockNumber(rpc, COLLECT_TIMEOUT);
    base.blockNumber = block.blockNumber;
    base.alive = true;

    try {
      const gas = await rpcGasPrice(rpc, COLLECT_TIMEOUT);
      base.gasPrice = gas.gasPrice;
    } catch {
      base.gasPrice = 0n;
    }

    return base;
  } catch {
    return base;
  }
}

// ── Main collection function ──────────────────────────────────────────────────

/**
 * Collect a full infrastructure snapshot.
 * Chain probes run L3 → L2 → L1 per GhostStack routing policy.
 * All I/O is bounded by COLLECT_TIMEOUT.
 */
export async function collectInfraSnapshot(): Promise<InfraSnapshot> {
  const [host, dockerStats, nodeExData] = await Promise.all([
    Promise.resolve(collectHostSnapshot()),
    collectDockerStats(),
    scrapeNodeExporter(),
  ]);

  // Merge node_exporter supplemental data into host snapshot
  if (nodeExData.diskIoMs   !== undefined) host.diskIoMs   = nodeExData.diskIoMs;
  if (nodeExData.netRxBytes !== undefined) host.netRxBytes = nodeExData.netRxBytes;
  if (nodeExData.netTxBytes !== undefined) host.netTxBytes = nodeExData.netTxBytes;
  if (nodeExData.swapTotal  !== undefined) {
    host.swapTotal   = nodeExData.swapTotal;
    host.swapFree    = nodeExData.swapFree ?? 0;
    host.swapUsagePct = host.swapTotal > 0
      ? 100 * (1 - host.swapFree / host.swapTotal)
      : 0;
  }

  // Enforce L3 → L2 → L1 probe order (mirrors the canonical routing law)
  const l3 = await probeChain("l3", 903,       L3_RPC);
  const l2 = await probeChain("l2", 901,       L2_RPC);
  const l1 = await probeChain("l1", 14000101,  L1_RPC);

  return {
    host,
    containers: dockerStats,
    chains:     [l3, l2, l1],
    collectedAt: Date.now(),
  };
}

export { DOCKER_SOCKET };
