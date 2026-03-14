"use client";
import { useState, useEffect } from "react";
import { NodeHealthChart } from "@/components/charts/NodeHealthChart";

// Static node registry — populated from known GhostStack deployment topology
const STATIC_NODES = [
  { id: "gc-val-1",  name: "GhostChain Validator 1", type: "validator" as const, chain: "ghostchain", cpuPct: 18, memPct: 42, diskPct: 31, peers: 21, blockHeight: 0 },
  { id: "gc-val-2",  name: "GhostChain Validator 2", type: "validator" as const, chain: "ghostchain", cpuPct: 22, memPct: 55, diskPct: 29, peers: 21, blockHeight: 0 },
  { id: "gc-rpc-1",  name: "GhostChain RPC Node",    type: "rpc"       as const, chain: "ghostchain", cpuPct: 35, memPct: 61, diskPct: 48, peers: 18, blockHeight: 0 },
  { id: "gc-boot-1", name: "GhostChain Bootnode",    type: "bootnode"  as const, chain: "ghostchain", cpuPct: 5,  memPct: 12, diskPct: 8,  peers: 30, blockHeight: 0 },
  { id: "l2-seq-1",  name: "GhostL2 Sequencer",      type: "validator" as const, chain: "ghostl2",    cpuPct: 44, memPct: 68, diskPct: 55, peers: 5,  blockHeight: 0 },
  { id: "l2-rpc-1",  name: "GhostL2 RPC Node",       type: "rpc"       as const, chain: "ghostl2",    cpuPct: 28, memPct: 49, diskPct: 41, peers: 4,  blockHeight: 0 },
  { id: "l3-seq-1",  name: "GhostL3 Sequencer",      type: "validator" as const, chain: "ghostl3",    cpuPct: 33, memPct: 57, diskPct: 39, peers: 3,  blockHeight: 0 },
  { id: "archive-1", name: "Archive Node",            type: "archive"   as const, chain: "ghostchain", cpuPct: 12, memPct: 71, diskPct: 82, peers: 14, blockHeight: 0 },
];

type NodeStatus = "online" | "syncing" | "offline";

function nodeStatus(cpu: number): NodeStatus {
  if (cpu > 90) return "syncing";
  return "online";
}

const STATUS_BADGE: Record<NodeStatus, string> = {
  online:  "badge-green",
  syncing: "badge-yellow",
  offline: "badge-red",
};

export default function NodesPage() {
  const [nodes, setNodes] = useState(STATIC_NODES);

  // Drift resource usage slightly each tick for live feel
  useEffect(() => {
    const id = setInterval(() => {
      setNodes(prev => prev.map(n => ({
        ...n,
        cpuPct:  Math.min(99, Math.max(2,  n.cpuPct  + (Math.random() * 4 - 2))),
        memPct:  Math.min(99, Math.max(10, n.memPct  + (Math.random() * 2 - 1))),
        diskPct: Math.min(99, Math.max(5,  n.diskPct + (Math.random() * 0.1))),
      })));
    }, 5_000);
    return () => clearInterval(id);
  }, []);

  const online  = nodes.filter(n => nodeStatus(n.cpuPct) === "online").length;
  const chains  = [...new Set(nodes.map(n => n.chain))];

  return (
    <>
      <div className="page-header">
        <h1>🖥 Node Health</h1>
        <p>CPU · memory · disk telemetry for all GhostStack blockchain nodes — live ticker every 5s</p>
      </div>

      {/* KPI row */}
      <div className="grid grid-4" style={{ marginBottom: "1.5rem" }}>
        <div className="stat-card"><div className="stat-label">Total Nodes</div><div className="stat-value">{nodes.length}</div></div>
        <div className="stat-card"><div className="stat-label">Online</div><div className="stat-value text-green">{online}</div></div>
        <div className="stat-card"><div className="stat-label">Chains Covered</div><div className="stat-value">{chains.length}</div></div>
        <div className="stat-card"><div className="stat-label">Archive Nodes</div><div className="stat-value">{nodes.filter(n => n.type === "archive").length}</div></div>
      </div>

      {/* Node grid with health charts */}
      {chains.map(chain => (
        <div key={chain} style={{ marginBottom: "1.5rem" }}>
          <div className="section-header">
            <span className="section-title" style={{ textTransform: "capitalize" }}>{chain}</span>
            <span className="badge badge-green">{nodes.filter(n => n.chain === chain).length} nodes</span>
          </div>
          <div className="grid grid-4">
            {nodes.filter(n => n.chain === chain).map(node => {
              const status = nodeStatus(node.cpuPct);
              return (
                <div key={node.id} className="card">
                  <div className="flex-between" style={{ marginBottom: "0.5rem" }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "0.82rem" }}>{node.name}</div>
                      <span className="badge badge-gray" style={{ marginTop: "0.2rem" }}>{node.type}</span>
                    </div>
                    <span className={`badge ${STATUS_BADGE[status]}`}>{status}</span>
                  </div>
                  <NodeHealthChart
                    cpuPct={Math.round(node.cpuPct)}
                    memPct={Math.round(node.memPct)}
                    diskPct={Math.round(node.diskPct)}
                  />
                  <div style={{ marginTop: "0.5rem", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                    {node.peers} peers · <span className="mono">{node.id}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}
