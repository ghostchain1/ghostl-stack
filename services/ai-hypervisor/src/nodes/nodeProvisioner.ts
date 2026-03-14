/**
 * nodeProvisioner.ts — GhostStack Hypervisor Control Layer
 * Deploys and manages blockchain nodes across all GhostChain networks.
 */

import { v4 as uuid } from "uuid";

export type ChainId  = "ghostchain" | "ghostl2" | "ghostl3";
export type NodeRole = "validator" | "rpc-node" | "archive-node" | "bootnode";
export type NodeState= "deploying" | "syncing" | "running" | "offline" | "degraded" | "decommissioned";

export interface GhostNode {
  id:             string;
  chain:          ChainId;
  role:           NodeRole;
  state:          NodeState;
  vmId:           string;
  ip:             string;
  rpcPort:        number;
  wsPort:         number;
  p2pPort:        number;
  blockHeight:    number;
  peersConnected: number;
  isSynced:       boolean;
  cpuPct:         number;
  memMB:          number;
  txPerSec:       number;
  uptime:         number;  // seconds
  deployedAt:     number;
  lastBlock:      number;
}

export interface NodeProvisionRequest {
  chain:    ChainId;
  role:     NodeRole;
  vmId?:    string;
}

export interface NodeProvisionResult {
  node:    GhostNode;
  status:  "deploying" | "failed";
  message: string;
}

// ── Seeded nodes ──────────────────────────────────────────────────────────────
const SEED: Array<Omit<GhostNode, "cpuPct" | "memMB" | "txPerSec" | "uptime" | "lastBlock">> = [
  // GhostChain L1
  { id: "node-gc-boot", chain: "ghostchain", role: "bootnode",   state: "running",  vmId: "vm-gc-val-1", ip: "192.168.10.11", rpcPort: 0,    wsPort: 0,    p2pPort: 30305, blockHeight: 0,    peersConnected: 4, isSynced: true,  deployedAt: Date.now() - 86400000 * 60 },
  { id: "node-gc-v1",   chain: "ghostchain", role: "validator",  state: "running",  vmId: "vm-gc-val-1", ip: "192.168.10.11", rpcPort: 8545, wsPort: 8546, p2pPort: 30303, blockHeight: 4521033, peersConnected: 6, isSynced: true, deployedAt: Date.now() - 86400000 * 60 },
  { id: "node-gc-v2",   chain: "ghostchain", role: "validator",  state: "running",  vmId: "vm-gc-val-2", ip: "192.168.10.12", rpcPort: 8645, wsPort: 8646, p2pPort: 30304, blockHeight: 4521031, peersConnected: 5, isSynced: true, deployedAt: Date.now() - 86400000 * 60 },
  { id: "node-gc-v3",   chain: "ghostchain", role: "validator",  state: "running",  vmId: "vm-gc-val-3", ip: "192.168.10.13", rpcPort: 8745, wsPort: 8746, p2pPort: 30306, blockHeight: 4521033, peersConnected: 5, isSynced: true, deployedAt: Date.now() - 86400000 * 30 },
  { id: "node-gc-v4",   chain: "ghostchain", role: "validator",  state: "offline",  vmId: "vm-gc-val-4", ip: "192.168.10.14", rpcPort: 8845, wsPort: 8846, p2pPort: 30307, blockHeight: 4518000, peersConnected: 0, isSynced: false, deployedAt: Date.now() - 86400000 * 30 },
  { id: "node-gc-rpc",  chain: "ghostchain", role: "rpc-node",   state: "running",  vmId: "vm-brain",    ip: "192.168.10.30", rpcPort: 8545, wsPort: 8546, p2pPort: 30308, blockHeight: 4521033, peersConnected: 8, isSynced: true, deployedAt: Date.now() - 86400000 * 45 },
  // GhostL2
  { id: "node-l2-v1",   chain: "ghostl2",    role: "validator",  state: "running",  vmId: "vm-l2-node",  ip: "192.168.10.20", rpcPort: 9545, wsPort: 9546, p2pPort: 30403, blockHeight: 2184522, peersConnected: 4, isSynced: true, deployedAt: Date.now() - 86400000 * 45 },
  { id: "node-l2-rpc",  chain: "ghostl2",    role: "rpc-node",   state: "running",  vmId: "vm-l2-node",  ip: "192.168.10.20", rpcPort: 9645, wsPort: 9646, p2pPort: 30404, blockHeight: 2184522, peersConnected: 3, isSynced: true, deployedAt: Date.now() - 86400000 * 45 },
  // GhostL3
  { id: "node-l3-v1",   chain: "ghostl3",    role: "validator",  state: "running",  vmId: "vm-l3-node",  ip: "192.168.10.21", rpcPort: 9745, wsPort: 9746, p2pPort: 30503, blockHeight: 987341,  peersConnected: 3, isSynced: true, deployedAt: Date.now() - 86400000 * 20 },
  { id: "node-l3-rpc",  chain: "ghostl3",    role: "rpc-node",   state: "syncing",  vmId: "vm-l3-node",  ip: "192.168.10.21", rpcPort: 9845, wsPort: 9846, p2pPort: 30504, blockHeight: 984000,  peersConnected: 2, isSynced: false, deployedAt: Date.now() - 86400000 * 3 },
];

const BASE_BLOCK: Record<ChainId, number> = { ghostchain: 4521033, ghostl2: 2184522, ghostl3: 987341 };

const nodes: Map<string, GhostNode> = new Map(
  SEED.map((s) => [
    s.id,
    {
      ...s,
      cpuPct:   s.state === "running" ? 10 + Math.random() * 30 : 0,
      memMB:    s.state === "running" ? 256 + Math.random() * 1024 : 0,
      txPerSec: s.state === "running" ? Math.random() * 50 : 0,
      uptime:   s.state === "running" ? Math.floor((Date.now() - s.deployedAt) / 1000) : 0,
      lastBlock: Date.now() - Math.floor(Math.random() * 12000),
    },
  ])
);

const provisionHistory: NodeProvisionResult[] = [];

// ── Exports ───────────────────────────────────────────────────────────────────

export function getNodes(chain?: ChainId, role?: NodeRole, state?: NodeState): GhostNode[] {
  return [...nodes.values()].filter(
    (n) => (!chain || n.chain === chain) && (!role || n.role === role) && (!state || n.state === state)
  );
}

export function getNode(id: string): GhostNode | undefined {
  return nodes.get(id);
}

export function getNodeStats() {
  const all = [...nodes.values()];
  const chains: ChainId[] = ["ghostchain", "ghostl2", "ghostl3"];
  const roles:  NodeRole[] = ["validator", "rpc-node", "archive-node", "bootnode"];
  return {
    total:     all.length,
    running:   all.filter((n) => n.state === "running").length,
    offline:   all.filter((n) => n.state === "offline").length,
    syncing:   all.filter((n) => n.state === "syncing").length,
    degraded:  all.filter((n) => n.state === "degraded").length,
    synced:    all.filter((n) => n.isSynced).length,
    totalTxPerSec: all.reduce((s, n) => s + n.txPerSec, 0),
    byChain:   Object.fromEntries(
      chains.map((c) => [c, {
        total:   all.filter((n) => n.chain === c).length,
        running: all.filter((n) => n.chain === c && n.state === "running").length,
        blockHeight: BASE_BLOCK[c],
      }])
    ),
    byRole: Object.fromEntries(
      roles.map((r) => [r, all.filter((n) => n.role === r).length])
    ),
  };
}

export async function deployNode(req: NodeProvisionRequest): Promise<NodeProvisionResult> {
  const id = `node-${req.chain.slice(0, 2)}-${uuid().slice(0, 6)}`;
  const vmId = req.vmId ?? "vm-gc-val-1";
  const portBase = req.chain === "ghostchain" ? 8500 : req.chain === "ghostl2" ? 9500 : 9700;
  const offset   = nodes.size * 10;
  const node: GhostNode = {
    id, chain: req.chain, role: req.role,
    state:          "deploying",
    vmId,
    ip:             "192.168.10.99",
    rpcPort:        portBase + offset,
    wsPort:         portBase + offset + 1,
    p2pPort:        30300 + offset,
    blockHeight:    0,
    peersConnected: 0,
    isSynced:       false,
    cpuPct:         0, memMB: 0, txPerSec: 0, uptime: 0,
    deployedAt:     Date.now(),
    lastBlock:      Date.now(),
  };
  nodes.set(id, node);
  // Simulate deploy → syncing → running
  setTimeout(() => { node.state = "syncing"; node.blockHeight = Math.floor(BASE_BLOCK[req.chain] * 0.8); }, 2000);
  setTimeout(() => { node.state = "running"; node.isSynced = true; node.blockHeight = BASE_BLOCK[req.chain]; node.cpuPct = 15; node.memMB = 512; node.peersConnected = 3; }, 5000);
  const result: NodeProvisionResult = { node, status: "deploying", message: `Node ${id} deploying on ${req.chain} as ${req.role}` };
  provisionHistory.push(result);
  return result;
}

export async function decommissionNode(id: string): Promise<{ success: boolean; message: string }> {
  const node = nodes.get(id);
  if (!node) return { success: false, message: "Node not found" };
  node.state = "decommissioned";
  setTimeout(() => { nodes.delete(id); }, 3000);
  return { success: true, message: `Node ${id} decommissioned` };
}

export function getProvisionHistory(): NodeProvisionResult[] {
  return provisionHistory.slice(-50);
}

export function tickNodeTelemetry(): void {
  for (const n of nodes.values()) {
    if (n.state !== "running") continue;
    n.uptime       += 60;
    n.cpuPct        = Math.max(5, Math.min(85, n.cpuPct + (Math.random() - 0.47) * 6));
    n.memMB         = Math.max(128, Math.min(4096, n.memMB + (Math.random() - 0.47) * 30));
    n.txPerSec      = Math.max(0, n.txPerSec + (Math.random() - 0.45) * 5);
    n.blockHeight  += Math.random() < 0.9 ? Math.floor(Math.random() * 3) : 0;
    n.peersConnected = Math.max(1, Math.min(25, n.peersConnected + (Math.random() < 0.2 ? (Math.random() < 0.5 ? 1 : -1) : 0)));
    n.lastBlock     = Date.now();
    BASE_BLOCK[n.chain] = Math.max(BASE_BLOCK[n.chain], n.blockHeight);
  }
}
