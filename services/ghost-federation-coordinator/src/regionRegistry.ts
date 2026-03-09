/**
 * GhostStack Federation Coordinator — Region Registry
 * Maintains live state of all 6 global region clusters.
 */
import { fetch } from "undici";
import {
  type FederationRegion,
  type ClusterNode,
  type RegionCluster,
  FEDERATION_REGIONS,
  REGION_NAMES,
} from "ghost-federation-sdk";

const PROBE_INTERVAL_MS = Number(process.env.PROBE_INTERVAL_MS ?? 30_000);
const RPC_TIMEOUT_MS = 5_000;

// eth_blockNumber over JSON-RPC
async function fetchBlockNumber(rpcUrl: string): Promise<bigint | null> {
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "ghost_blockNumber", params: [], id: 1 }),
      signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
    });
    const data = (await res.json()) as { result?: string };
    return data.result ? BigInt(data.result) : null;
  } catch {
    return null;
  }
}

async function probeNodeHealth(node: ClusterNode): Promise<boolean> {
  try {
    const res = await fetch(`http://${node.host}:${node.l1Port}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "net_version", params: [], id: 1 }),
      signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function computeClusterStatus(nodes: ClusterNode[]): RegionCluster["status"] {
  if (nodes.length === 0) return "offline";
  const onlineCount = nodes.filter((n) => n.online).length;
  const ratio = onlineCount / nodes.length;
  if (ratio >= 0.67) return "healthy";
  if (ratio >= 0.34) return "degraded";
  return "offline";
}

class RegionRegistry {
  private clusters = new Map<FederationRegion, RegionCluster>();
  private nodes = new Map<string, ClusterNode>(); // nodeId → ClusterNode
  private probeTimer: NodeJS.Timeout | null = null;

  constructor() {
    // Initialise empty cluster stubs for all 6 regions
    for (const region of FEDERATION_REGIONS) {
      this.clusters.set(region, {
        region,
        name: REGION_NAMES[region],
        status: "offline",
        nodes: [],
        validatorCount: 0,
        tps: 0,
        avgLatencyMs: 0,
        updatedAt: Date.now(),
      });
    }
  }

  registerNode(node: ClusterNode): void {
    this.nodes.set(node.id, node);
    const cluster = this.clusters.get(node.region);
    if (!cluster) return;
    const existing = cluster.nodes.findIndex((n) => n.id === node.id);
    if (existing >= 0) {
      cluster.nodes[existing] = node;
    } else {
      cluster.nodes.push(node);
    }
    this.recalcCluster(node.region);
  }

  removeNode(nodeId: string): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;
    this.nodes.delete(nodeId);
    const cluster = this.clusters.get(node.region);
    if (!cluster) return;
    cluster.nodes = cluster.nodes.filter((n) => n.id !== nodeId);
    this.recalcCluster(node.region);
  }

  getCluster(region: FederationRegion): RegionCluster | undefined {
    return this.clusters.get(region);
  }

  getAllClusters(): RegionCluster[] {
    return [...this.clusters.values()];
  }

  getAllNodes(): ClusterNode[] {
    return [...this.nodes.values()];
  }

  private recalcCluster(region: FederationRegion): void {
    const cluster = this.clusters.get(region);
    if (!cluster) return;
    cluster.validatorCount = cluster.nodes.filter((n) => n.role === "validator").length;
    cluster.status = computeClusterStatus(cluster.nodes);
    cluster.updatedAt = Date.now();
  }

  startProbing(): void {
    if (this.probeTimer) return;
    this.probeTimer = setInterval(() => void this.probeAll(), PROBE_INTERVAL_MS);
    // Immediate first probe
    void this.probeAll();
  }

  stopProbing(): void {
    if (this.probeTimer) {
      clearInterval(this.probeTimer);
      this.probeTimer = null;
    }
  }

  private async probeAll(): Promise<void> {
    const tasks = [...this.nodes.values()].map(async (node) => {
      const online = await probeNodeHealth(node);
      node.online = online;
      node.lastSeen = online ? Date.now() : node.lastSeen;

      if (online) {
        const [l1Block, l2Block, l3Block] = await Promise.allSettled([
          fetchBlockNumber(`http://${node.host}:${node.l1Port}`),
          fetchBlockNumber(`http://${node.host}:${node.l2Port}`),
          fetchBlockNumber(`http://${node.host}:${node.l3Port}`),
        ]);
        node.blockL1 = l1Block.status === "fulfilled" && l1Block.value !== null ? Number(l1Block.value) : node.blockL1;
        node.blockL2 = l2Block.status === "fulfilled" && l2Block.value !== null ? Number(l2Block.value) : node.blockL2;
        node.blockL3 = l3Block.status === "fulfilled" && l3Block.value !== null ? Number(l3Block.value) : node.blockL3;
      }

      this.nodes.set(node.id, node);
      const cluster = this.clusters.get(node.region);
      if (cluster) {
        const idx = cluster.nodes.findIndex((n) => n.id === node.id);
        if (idx >= 0) cluster.nodes[idx] = node;
      }
    });

    await Promise.allSettled(tasks);

    // Recalc all cluster statuses post-probe
    for (const region of FEDERATION_REGIONS) {
      this.recalcCluster(region);
    }
  }
}

export const regionRegistry = new RegionRegistry();
